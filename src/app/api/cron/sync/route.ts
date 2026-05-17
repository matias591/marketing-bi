/**
 * Weekly Salesforce sync — pulls all 7 SF objects into raw.sf_*.
 *
 * Schedule: defined in vercel.json. Vercel calls this with
 *   `Authorization: Bearer ${CRON_SECRET}`.
 *
 * Lifecycle:
 *   1. Validate auth.
 *   2. Open a fresh sync_runs row (status='running').
 *   3. SF JWT → jsforce Connection.
 *   4. KEEP-ALIVE first (Pitfall 9 — wakes paused free-tier Supabase before any
 *      heavier work that would otherwise time out on the cold start).
 *   5. For each SF_OBJECTS in order, run syncObject. Catch per-object errors
 *      and continue (Pitfall — one object failing must not abort the whole
 *      sync).
 *   6. Close sync_runs row with status='success' | 'partial' | 'failed' and
 *      aggregated row_counts.
 *
 * Runtime: nodejs (PLAT-12). maxDuration: 300 (Pro) / 60 (Hobby).
 *   - For weekly sync of full 7 objects + Bulk API for CampaignMember, 60s
 *     should be enough on first runs but could be tight at peak. If we hit
 *     the limit, split into per-object cron entries (Phase 2 polish).
 */
import postgres from "postgres";
import { NextResponse, type NextRequest } from "next/server";
import { getJsforceConnection } from "@/lib/sf/jwt";
import { SF_OBJECTS } from "@/lib/sf/objects";
import { syncObject } from "@/lib/sf/sync";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function unauthorized(reason: string) {
  return new NextResponse(reason, { status: 401 });
}

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return unauthorized("invalid or missing cron secret");
  }

  // ?mode=delta → sync only CampaignMember (daily delta for status changes).
  // No mode param → full sync of all 7 objects (weekly).
  const mode = request.nextUrl.searchParams.get("mode");
  return runSync({ triggeredBy: "cron", deltaOnly: mode === "delta" });
}

// Allow manual `POST /api/cron/sync` from a developer laptop with the secret in
// the body (useful for first-run / smoke-test). Same auth gate.
export async function POST(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!expected || auth !== `Bearer ${expected}`) {
    return unauthorized("invalid or missing cron secret");
  }
  const mode = request.nextUrl.searchParams.get("mode");
  return runSync({ triggeredBy: "manual", deltaOnly: mode === "delta" });
}

interface RunOptions {
  triggeredBy: "cron" | "manual";
  deltaOnly?: boolean; // when true, sync only CampaignMember
}

async function runSync({ triggeredBy, deltaOnly = false }: RunOptions) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return NextResponse.json(
      { error: "DATABASE_URL not set" },
      { status: 500 },
    );
  }
  const sql = postgres(dbUrl, { prepare: false, max: 1, idle_timeout: 5 });

  let runId: string | null = null;
  const rowCounts: Record<string, { fetched: number; upserted: number; durationMs: number }> = {};
  const errors: { object: string; message: string }[] = [];

  try {
    // 4. Keep-alive (Pitfall 9).
    await sql`SELECT 1`;

    // 2. Open run row.
    const inserted = await sql<{ id: string }[]>`
      INSERT INTO ops.sync_runs (status, triggered_by) VALUES ('running', ${triggeredBy})
      RETURNING id
    `;
    runId = inserted[0].id;

    const log = (msg: string, extra: Record<string, unknown> = {}) => {
      console.log(JSON.stringify({ runId, msg, ...extra }));
    };

    // 3. SF connection.
    log("authorizing SF JWT");
    const conn = await getJsforceConnection();

    // 5. Per-object sync (continue on error).
    // Delta mode syncs only CampaignMember (daily status-change capture).
    const objectsToSync = deltaOnly
      ? SF_OBJECTS.filter((o) => o.name === "CampaignMember")
      : SF_OBJECTS;

    for (const obj of objectsToSync) {
      try {
        const stats = await syncObject(obj, { conn, sql, runId, log });
        rowCounts[obj.name] = stats;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push({ object: obj.name, message });
        await sql`
          INSERT INTO ops.sync_errors (run_id, object_name, error_code, message, raw_error)
          VALUES (${runId}, ${obj.name}, ${(err as { errorCode?: string })?.errorCode ?? null}, ${message}, ${sql.json(serializeErr(err) as unknown as postgres.JSONValue)})
        `;
        log("object failed", { object: obj.name, error: message });
      }
    }

    // 5b. Refresh attribution marts (Phase 3) — only when at least some
    //     extracts succeeded. CONCURRENTLY keeps the dashboards queryable.
    if (errors.length < objectsToSync.length) {
      log("refreshing marts");
      try {
        if (!deltaOnly) {
          // Full sync: refresh all marts including lifecycle_transitions.
          await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY mart.lifecycle_transitions`);
        }
        // Both full and delta refresh the touchpoints + attribution chain.
        await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY mart.touchpoints`);
        await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY mart.attribution_contact`);
        await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY mart.attribution_account`);
        await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY mart.opportunity_credit`);
        await sql.unsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY mart.data_quality_flags`);
        if (!deltaOnly) {
          await sql.unsafe(`ANALYZE mart.lifecycle_transitions`);
        }
        await sql.unsafe(`ANALYZE mart.touchpoints`);
        await sql.unsafe(`ANALYZE mart.attribution_contact`);
        await sql.unsafe(`ANALYZE mart.attribution_account`);
        await sql.unsafe(`ANALYZE mart.opportunity_credit`);
        await sql.unsafe(`ANALYZE mart.data_quality_flags`);
        log("marts refreshed");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        // Log but don't fail the run — raw layer is still good even if marts didn't refresh.
        // /admin/sync (P6) will surface this; for now it shows up in sync_errors.
        await sql`
          INSERT INTO ops.sync_errors (run_id, object_name, error_code, message, raw_error)
          VALUES (${runId}, 'mart_refresh', 'REFRESH_FAILED', ${message}, ${sql.json({ message } as unknown as postgres.JSONValue)})
        `;
        log("mart refresh failed", { error: message });
        errors.push({ object: "mart_refresh", message });
      }
    }

    // 6. Close out.
    const status = errors.length === 0 ? "success" : errors.length >= objectsToSync.length ? "failed" : "partial";
    await sql`
      UPDATE ops.sync_runs
         SET finished_at = now(),
             status      = ${status},
             row_counts  = ${sql.json(rowCounts)},
             error       = ${errors.length > 0 ? errors.map((e) => `${e.object}: ${e.message}`).join("\n") : null}
       WHERE id = ${runId}
    `;

    return NextResponse.json({ ok: true, runId, status, rowCounts, errors });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ runId, msg: "fatal sync error", error: message }));
    if (runId) {
      try {
        await sql`
          UPDATE ops.sync_runs
             SET finished_at = now(),
                 status      = 'failed',
                 row_counts  = ${sql.json(rowCounts)},
                 error       = ${message}
           WHERE id = ${runId}
        `;
      } catch {
        // best-effort
      }
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function serializeErr(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  if (typeof err === "object" && err !== null) {
    return err as Record<string, unknown>;
  }
  return { value: String(err) };
}
