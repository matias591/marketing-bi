/**
 * Per-object sync orchestration.
 *
 * For each SfObjectDef:
 *   1. Read prior watermark from `ops.watermarks` (null on first run).
 *   2. Build SOQL: `SELECT {fields} FROM {object} WHERE LastModifiedDate > {watermark}`
 *      (omit WHERE on first run; that's the implicit backfill).
 *   3. Execute via Bulk API 2.0 (`useBulkApi`) or REST (`query` / `queryAll`).
 *   4. Map rows + bulk-upsert into `raw.sf_*` (chunked).
 *   5. Update watermark to MAX(LastModifiedDate) of fetched rows on success.
 *
 * Snapshot writes (Pitfall 6/16) are layered on top of Contact + Campaign:
 *   - On Contact sync: write per-Contact `(original_source, latest_source)`
 *     into `ops.contact_source_history` keyed by (contact_id, sync_run_id).
 *   - On Campaign sync: write per-Campaign `(name, type, status)` into
 *     `ops.campaigns_history` keyed by (campaign_id, sync_run_id).
 */
import postgres from "postgres";
import type { Connection } from "@jsforce/jsforce-node";
import type { SfObjectDef } from "./objects";

const CHUNK = 500;

interface RunDeps {
  conn: Connection;
  sql: postgres.Sql;
  runId: string;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

interface ObjectStats {
  fetched: number;
  upserted: number;
  durationMs: number;
}

export async function syncObject(def: SfObjectDef, deps: RunDeps): Promise<ObjectStats> {
  const start = Date.now();
  const { conn, sql, runId, log } = deps;

  // 1. Read prior watermark — Postgres returns timestamptz as a JS Date.
  //    We need it in SOQL-friendly ISO 8601 (YYYY-MM-DDTHH:MM:SSZ).
  const wmRows = await sql<{ last_modified_date: Date | string | null }[]>`
    SELECT last_modified_date FROM ops.watermarks WHERE object_name = ${def.name}
  `;
  const watermarkRaw = wmRows[0]?.last_modified_date ?? null;
  const watermark = watermarkRaw
    ? (watermarkRaw instanceof Date ? watermarkRaw.toISOString() : new Date(watermarkRaw).toISOString())
    : null;

  // 2. Build SOQL. SOQL accepts ISO 8601 datetime literals unquoted, e.g.
  //    `WHERE LastModifiedDate > 2026-05-10T10:19:32Z`.
  // We use REST query with manual pagination for every object — handled
  // 187K CampaignMembers in ~3 min on prod, well within Vercel's 300s ceiling.
  //
  // INVALID_FIELD self-healing (DATA-12 polish):
  //   If SF rejects a field that doesn't exist in this org's schema, parse
  //   the field name out of the error, drop it from the SELECT list, log
  //   it to ops.sync_errors, and retry. Loops until either the query succeeds
  //   or every field has been removed (defensive cap).
  const buildSoql = (fields: string[]) => {
    const fieldList = fields.join(", ");
    const whereClause = watermark ? `WHERE LastModifiedDate > ${watermark}` : "";
    return `SELECT ${fieldList} FROM ${def.name} ${whereClause}`.trim();
  };

  let fields = [...def.fields];
  const removedFields: string[] = [];
  let records: Array<Record<string, unknown>> = [];

  for (let attempt = 0; attempt < def.fields.length; attempt++) {
    const soql = buildSoql(fields);
    log(`fetching ${def.name}`, {
      watermark,
      attempt: attempt + 1,
      fieldCount: fields.length,
      removed: removedFields.length > 0 ? removedFields : undefined,
    });
    try {
      records = await fetchViaRest(conn, soql, def.useQueryAll);
      break;
    } catch (err: unknown) {
      const invalidField = extractInvalidField(err);
      if (!invalidField || !fields.includes(invalidField)) {
        // Either it's a different error, or we already removed this field.
        // Re-throw — let the cron handler record it in sync_errors.
        throw err;
      }
      removedFields.push(invalidField);
      fields = fields.filter((f) => f !== invalidField);
      log(`dropped invalid field ${invalidField} from ${def.name}`, {
        attempt: attempt + 1,
        fieldsRemaining: fields.length,
      });
      await sql`
        INSERT INTO ops.sync_errors (run_id, object_name, error_code, message, raw_error)
        VALUES (${runId}, ${def.name}, 'INVALID_FIELD_RECOVERED', ${`Dropped field ${invalidField} and retried`}, ${sql.json({ field: invalidField, attempt: attempt + 1 } as unknown as postgres.JSONValue)})
      `;
    }
  }

  log(`fetched ${def.name}`, { rows: records.length });

  // 4. Map + upsert.
  let upserted = 0;
  let maxLastMod: string | null = watermark;
  if (records.length > 0) {
    const mapped = records.map(def.mapRow);
    upserted = await upsertChunks(sql, def.destTable, mapped);

    // Track MAX(LastModifiedDate) for watermark advance.
    for (const r of records) {
      const lm = r.LastModifiedDate;
      if (typeof lm === "string" && (!maxLastMod || lm > maxLastMod)) {
        maxLastMod = lm;
      }
    }

    // Snapshots (Pitfall 6 / 16).
    if (def.name === "Contact") {
      await sql`
        INSERT INTO ops.contact_source_history (contact_id, sync_run_id, original_source, latest_source)
        SELECT id, ${runId}, original_source, latest_source FROM raw.sf_contact
        WHERE id = ANY(${mapped.map((m) => m.id as string)})
        ON CONFLICT (contact_id, sync_run_id) DO NOTHING
      `;
    }
    if (def.name === "Campaign") {
      await sql`
        INSERT INTO ops.campaigns_history (campaign_id, sync_run_id, name, type, status)
        SELECT id, ${runId}, name, type, status FROM raw.sf_campaign
        WHERE id = ANY(${mapped.map((m) => m.id as string)})
        ON CONFLICT (campaign_id, sync_run_id) DO NOTHING
      `;
    }
  }

  // 5. Advance watermark on success.
  if (maxLastMod) {
    await sql`
      INSERT INTO ops.watermarks (object_name, last_modified_date, updated_at)
      VALUES (${def.name}, ${maxLastMod}, now())
      ON CONFLICT (object_name) DO UPDATE
        SET last_modified_date = EXCLUDED.last_modified_date,
            updated_at = now()
    `;
  }

  const durationMs = Date.now() - start;

  await sql`
    INSERT INTO ops.sync_object_stats (run_id, object_name, fetched, upserted, duration_ms)
    VALUES (${runId}, ${def.name}, ${records.length}, ${upserted}, ${durationMs})
  `;

  return { fetched: records.length, upserted, durationMs };
}

async function upsertChunks(
  sql: postgres.Sql,
  destTable: string,
  rows: Array<Record<string, unknown>>,
): Promise<number> {
  if (rows.length === 0) return 0;
  const cols = Object.keys(rows[0]);
  const updateClause = cols
    .filter((c) => c !== "id")
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");

  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = sql(slice as readonly Record<string, unknown>[], ...cols);
    // Note: `synced_at` is set by the column DEFAULT to now() — we don't pass it
    // explicitly so the DB stamps it on insert. On update, it stays at the
    // original insert time; that's fine — the freshness signal lives on
    // `ops.sync_runs.finished_at`, not per-row `synced_at`.
    await sql`
      INSERT INTO ${sql(destTable)} ${values}
      ON CONFLICT (id) DO UPDATE SET ${sql.unsafe(updateClause)}
    `;
    total += slice.length;
  }
  return total;
}

/**
 * REST query with manual pagination via `nextRecordsUrl`. jsforce v3's
 * `conn.query()` returns just the first batch (max 2000); we walk
 * `queryMore()` until `done` is true. The optional `scanAll` includes
 * soft-deleted records (`IsDeleted = true`).
 */
async function fetchViaRest(
  conn: Connection,
  soql: string,
  useQueryAll: boolean,
): Promise<Array<Record<string, unknown>>> {
  const records: Array<Record<string, unknown>> = [];
  let result = await conn.query<Record<string, unknown>>(soql, { scanAll: useQueryAll });
  records.push(...((result.records ?? []) as Array<Record<string, unknown>>));
  while (!result.done && result.nextRecordsUrl) {
    result = (await conn.queryMore<Record<string, unknown>>(result.nextRecordsUrl)) as typeof result;
    records.push(...((result.records ?? []) as Array<Record<string, unknown>>));
  }
  return records;
}

/**
 * Pull the offending field name out of an SF INVALID_FIELD error.
 * SF errors take a few shapes; we try the common patterns:
 *
 *   "No such column 'XYZ' on entity 'Contact'"
 *   "Field name 'XYZ' on entity 'Contact'"
 *   "SELECT XYZ, Email FROM Contact ^ ERROR at Row:1:Column:8 No such column..."
 *
 * Returns null if we can't identify a specific field — caller should re-throw
 * so the cron handler logs and continues with other objects.
 */
function extractInvalidField(err: unknown): string | null {
  if (!err) return null;
  const msg = err instanceof Error
    ? err.message
    : typeof err === "string"
    ? err
    : typeof (err as { errorCode?: unknown; message?: unknown })?.message === "string"
    ? String((err as { message: string }).message)
    : "";
  if (!msg) return null;

  // Ignore non-INVALID_FIELD errors so we don't silently strip fields on
  // network or permission errors.
  const code = (err as { errorCode?: string })?.errorCode ?? "";
  if (code && code !== "INVALID_FIELD" && !msg.includes("INVALID_FIELD") && !msg.includes("No such column")) {
    return null;
  }

  const patterns: RegExp[] = [
    /No such column '([^']+)'/,
    /Field name '([^']+)'/,
    /(?:INVALID_FIELD|No such column)[^']*?:\s*([A-Za-z0-9_]+)/,
  ];
  for (const p of patterns) {
    const m = msg.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

