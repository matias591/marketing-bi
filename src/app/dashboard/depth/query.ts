/**
 * /dashboard/depth queries — Phase 6A (G5 Touchpoint Depth).
 *
 * For every Contact that reached SQL or Customer stage, count how many
 * distinct touchpoints they had in the 90-day window before that transition.
 * Bucket the counts into histogram bins for visualization, plus expose
 * mean / median callouts.
 *
 * The "Customer" stage uses mart.lifecycle_transitions.customer_date.
 */
import { db } from "@/db";
import { sql, type SQL } from "drizzle-orm";

type Stage = "sql" | "customer";

interface DepthFilters {
  fromDate: string | null;
  toDate: string | null;
  campaignTypes: string[] | null;
}

function typesInClause(types: string[]): SQL {
  const placeholders = sql.join(types.map((t) => sql`${t}`), sql`, `);
  return sql`camp.type IN (${placeholders})`;
}

interface CountRow {
  contactId: string;
  touchpointCount: number;
}

/**
 * Returns the per-Contact touchpoint count for the given stage. Used by both
 * the histogram bucketing and the mean/median callouts.
 */
async function getDepthRows(stage: Stage, args: DepthFilters): Promise<CountRow[]> {
  const transitionCol = stage === "sql" ? sql`c.sql_date` : sql`lt.customer_date`;
  const sourceJoin = stage === "sql"
    ? sql`raw.sf_contact c`
    : sql`raw.sf_contact c JOIN mart.lifecycle_transitions lt ON lt.contact_id = c.id`;
  const stageFilter = stage === "sql"
    ? sql`c.sql_date IS NOT NULL`
    : sql`lt.customer_date IS NOT NULL`;

  const dateConds: SQL[] = [];
  if (args.fromDate) dateConds.push(sql`${transitionCol} >= ${args.fromDate}::date`);
  if (args.toDate) dateConds.push(sql`${transitionCol} <= ${args.toDate}::date`);
  const dateClause = dateConds.length > 0
    ? sql`AND ${sql.join(dateConds, sql` AND `)}`
    : sql``;

  const typeClause = args.campaignTypes && args.campaignTypes.length > 0
    ? sql`AND ${typesInClause(args.campaignTypes)}`
    : sql``;

  const rows = await db.execute<{ contact_id: string; n: string | number }>(sql`
    SELECT c.id AS contact_id, COUNT(DISTINCT t.campaign_id) AS n
      FROM ${sourceJoin}
      JOIN mart.touchpoints t ON t.contact_id = c.id
      JOIN raw.sf_campaign camp ON camp.id = t.campaign_id
     WHERE NOT c.is_deleted
       AND NOT camp.is_deleted
       AND ${stageFilter}
       AND t.touchpoint_at <  ${transitionCol}
       AND t.touchpoint_at >= ${transitionCol} - INTERVAL '90 days'
       ${dateClause}
       ${typeClause}
     GROUP BY c.id
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    contactId: r.contact_id,
    touchpointCount: Number(r.n),
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DepthBucket {
  label: string;
  rangeStart: number;
  rangeEnd: number | null; // null = open-ended (e.g., 21+)
  sql: number;
  customer: number;
}

export interface DepthStats {
  buckets: DepthBucket[];
  sqlMean: number;
  sqlMedian: number;
  customerMean: number;
  customerMedian: number;
  sqlContacts: number;
  customerContacts: number;
}

const BUCKETS: Array<{ start: number; end: number | null; label: string }> = [
  { start: 1, end: 1, label: "1" },
  { start: 2, end: 2, label: "2" },
  { start: 3, end: 3, label: "3" },
  { start: 4, end: 4, label: "4" },
  { start: 5, end: 5, label: "5" },
  { start: 6, end: 7, label: "6–7" },
  { start: 8, end: 10, label: "8–10" },
  { start: 11, end: 15, label: "11–15" },
  { start: 16, end: 20, label: "16–20" },
  { start: 21, end: null, label: "21+" },
];

function bucketize(counts: number[]): number[] {
  const out = new Array(BUCKETS.length).fill(0);
  for (const n of counts) {
    const idx = BUCKETS.findIndex(
      (b) => n >= b.start && (b.end === null ? true : n <= b.end),
    );
    if (idx >= 0) out[idx] += 1;
  }
  return out;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function getTouchpointDepth(args: DepthFilters): Promise<DepthStats> {
  const [sqlRows, customerRows] = await Promise.all([
    getDepthRows("sql", args),
    getDepthRows("customer", args),
  ]);
  const sqlCounts = sqlRows.map((r) => r.touchpointCount);
  const customerCounts = customerRows.map((r) => r.touchpointCount);

  const sqlBins = bucketize(sqlCounts);
  const customerBins = bucketize(customerCounts);

  const buckets: DepthBucket[] = BUCKETS.map((b, i) => ({
    label: b.label,
    rangeStart: b.start,
    rangeEnd: b.end,
    sql: sqlBins[i],
    customer: customerBins[i],
  }));

  return {
    buckets,
    sqlMean: mean(sqlCounts),
    sqlMedian: median(sqlCounts),
    customerMean: mean(customerCounts),
    customerMedian: median(customerCounts),
    sqlContacts: sqlCounts.length,
    customerContacts: customerCounts.length,
  };
}
