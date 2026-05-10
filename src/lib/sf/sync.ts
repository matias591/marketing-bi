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

  // 1. Read prior watermark.
  const wmRows = await sql<{ last_modified_date: string | null }[]>`
    SELECT last_modified_date FROM ops.watermarks WHERE object_name = ${def.name}
  `;
  const watermark = wmRows[0]?.last_modified_date ?? null;

  // 2. Build SOQL.
  const fieldList = def.fields.join(", ");
  const whereClause = watermark ? `WHERE LastModifiedDate > ${watermark}` : "";
  const soql = `SELECT ${fieldList} FROM ${def.name} ${whereClause}`.trim();
  log(`fetching ${def.name}`, { watermark, useBulk: def.useBulkApi, useQueryAll: def.useQueryAll });

  // 3. Execute.
  let records: Array<Record<string, unknown>>;
  if (def.useBulkApi) {
    records = await fetchViaBulkV2(conn, def.name, soql, def.useQueryAll);
  } else {
    // jsforce v3 — `scanAll: true` is the equivalent of the old `queryAll`,
    // which mirrors soft-deleted (`IsDeleted=true`) rows.
    const result = await conn.query<Record<string, unknown>>(soql, {
      scanAll: def.useQueryAll,
    });
    records = (result.records ?? []) as Array<Record<string, unknown>>;
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
 * Bulk API 2.0 query — uses jsforce's bulk2 helper. Internally creates a
 * QueryJob, waits for it to complete, and returns rows. Suitable for
 * 5K–10M+ row ranges; counts as a single API call.
 */
async function fetchViaBulkV2(
  conn: Connection,
  sobject: string,
  soql: string,
  useQueryAll: boolean,
): Promise<Array<Record<string, unknown>>> {
  type Bulk2Module = {
    query: (
      soql: string,
      options?: { scanAll?: boolean },
    ) => { toArray: () => Promise<Array<Record<string, unknown>>> };
  };

  const bulk2 = (conn as unknown as { bulk2: Bulk2Module }).bulk2;
  if (!bulk2 || typeof bulk2.query !== "function") {
    // Fallback: REST query for environments where bulk2 isn't wired up. Logs
    // a warning so the operator notices.
    console.warn(`[sync] ${sobject}: bulk2.query unavailable; falling back to REST query`);
    const result = await conn.query<Record<string, unknown>>(soql, { scanAll: useQueryAll });
    return (result.records ?? []) as Array<Record<string, unknown>>;
  }

  const job = bulk2.query(soql, { scanAll: useQueryAll });
  return await job.toArray();
}
