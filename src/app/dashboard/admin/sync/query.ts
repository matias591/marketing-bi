/**
 * /admin/sync data queries.
 *
 * Three views of the sync pipeline state:
 *   - Recent run history (ops.sync_runs, last 30)
 *   - Watermarks per SF object (ops.watermarks)
 *   - Recent errors (ops.sync_errors, last 50, with object_name + code)
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface SyncRunRow {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  triggeredBy: string;
  durationSeconds: number | null;
  rowCounts: Record<string, { fetched?: number; upserted?: number; durationMs?: number }>;
  error: string | null;
  totalUpserted: number;
}

export async function getRecentSyncRuns(limit = 30): Promise<SyncRunRow[]> {
  const rows = await db.execute<{
    id: string;
    started_at: Date | string;
    finished_at: Date | string | null;
    status: string;
    triggered_by: string;
    row_counts: Record<string, { fetched?: number; upserted?: number; durationMs?: number }>;
    error: string | null;
  }>(sql`
    SELECT id, started_at, finished_at, status, triggered_by, row_counts, error
      FROM ops.sync_runs
     ORDER BY started_at DESC
     LIMIT ${limit}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => {
    const started = r.started_at instanceof Date ? r.started_at : new Date(r.started_at);
    const finished = r.finished_at
      ? (r.finished_at instanceof Date ? r.finished_at : new Date(r.finished_at))
      : null;
    const totalUpserted = Object.values(r.row_counts ?? {}).reduce(
      (sum, v) => sum + Number(v?.upserted ?? 0),
      0,
    );
    return {
      id: r.id,
      startedAt: started.toISOString(),
      finishedAt: finished ? finished.toISOString() : null,
      status: r.status,
      triggeredBy: r.triggered_by,
      durationSeconds: finished ? Math.round((finished.getTime() - started.getTime()) / 1000) : null,
      rowCounts: r.row_counts ?? {},
      error: r.error,
      totalUpserted,
    };
  });
}

export interface WatermarkRow {
  objectName: string;
  lastModifiedDate: string | null;
  updatedAt: string | null;
}

export async function getWatermarks(): Promise<WatermarkRow[]> {
  const rows = await db.execute<{
    object_name: string;
    last_modified_date: Date | string | null;
    updated_at: Date | string | null;
  }>(sql`
    SELECT object_name, last_modified_date, updated_at
      FROM ops.watermarks
     ORDER BY object_name
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    objectName: r.object_name,
    lastModifiedDate: r.last_modified_date
      ? (r.last_modified_date instanceof Date ? r.last_modified_date.toISOString() : String(r.last_modified_date))
      : null,
    updatedAt: r.updated_at
      ? (r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at))
      : null,
  }));
}

export interface SyncErrorRow {
  id: string;
  runId: string;
  objectName: string;
  errorCode: string | null;
  message: string;
  occurredAt: string;
}

export async function getRecentSyncErrors(limit = 50): Promise<SyncErrorRow[]> {
  const rows = await db.execute<{
    id: string;
    run_id: string;
    object_name: string;
    error_code: string | null;
    message: string;
    occurred_at: Date | string;
  }>(sql`
    SELECT id, run_id, object_name, error_code, message, occurred_at
      FROM ops.sync_errors
     ORDER BY occurred_at DESC
     LIMIT ${limit}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    id: r.id,
    runId: r.run_id,
    objectName: r.object_name,
    errorCode: r.error_code,
    message: r.message,
    occurredAt: r.occurred_at instanceof Date ? r.occurred_at.toISOString() : String(r.occurred_at),
  }));
}
