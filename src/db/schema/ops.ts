/**
 * Operations layer — `ops.*`.
 *
 * Tracks sync run lifecycle, errors, watermarks, and historical snapshots that
 * cannot be reconstructed from raw.* alone.
 *
 *   - `ops.contact_source_history` (Pitfall 6 — MANDATORY from first sync):
 *     HubSpot rewrites Original_Source__c on Contact when emails change. If we
 *     don't snapshot per-run, historical first-touch attribution is permanently
 *     unrecoverable.
 *
 *   - `ops.campaigns_history` (Pitfall 16):
 *     Marketing renames campaign Type / Status picklist values; without
 *     snapshots, historical reports re-categorize themselves.
 */
import { bigint, integer, jsonb, pgSchema, primaryKey, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ops = pgSchema("ops");

export const syncRuns = ops.table("sync_runs", {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
  status: text().notNull().default("running"), // 'running' | 'success' | 'failed' | 'partial'
  triggeredBy: text().notNull().default("cron"), // 'cron' | 'manual'
  rowCounts: jsonb().notNull().default({}),
  error: text(),
});

export const syncErrors = ops.table("sync_errors", {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid().notNull().references(() => syncRuns.id, { onDelete: "cascade" }),
  objectName: text().notNull(),
  errorCode: text(),
  message: text().notNull(),
  rawError: jsonb(),
  occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const watermarks = ops.table("watermarks", {
  objectName: text().primaryKey(),
  lastModifiedDate: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const contactSourceHistory = ops.table(
  "contact_source_history",
  {
    contactId: varchar({ length: 18 }).notNull(),
    syncRunId: uuid().notNull().references(() => syncRuns.id, { onDelete: "cascade" }),
    originalSource: text(),
    latestSource: text(),
    snapshotAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.contactId, t.syncRunId] })],
);

export const campaignsHistory = ops.table(
  "campaigns_history",
  {
    campaignId: varchar({ length: 18 }).notNull(),
    syncRunId: uuid().notNull().references(() => syncRuns.id, { onDelete: "cascade" }),
    name: text(),
    type: text(),
    status: text(),
    snapshotAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.syncRunId] })],
);

// Defensive default: records the row count of each object pulled in a run, in
// addition to the `row_counts` JSONB on sync_runs. Useful for /admin/sync (P6).
export const syncObjectStats = ops.table("sync_object_stats", {
  id: uuid().primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid().notNull().references(() => syncRuns.id, { onDelete: "cascade" }),
  objectName: text().notNull(),
  fetched: integer().notNull().default(0),
  upserted: integer().notNull().default(0),
  durationMs: bigint({ mode: "number" }).notNull().default(0),
});
