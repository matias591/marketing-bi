/**
 * /dashboard/campaigns queries — Phase 4A.
 *
 * All three queries read from `mart.attribution_contact` and apply the same
 * filters (model, transition-date range, campaign type set). Filters are
 * URL-stateful so refresh / copy-link preserves the view.
 */
import { db } from "@/db";
import { sql, type SQL } from "drizzle-orm";
import type { AttributionModel } from "@/lib/dashboard-filters";

interface FilterArgs {
  model: AttributionModel;
  fromDate: string | null; // ISO YYYY-MM-DD inclusive
  toDate: string | null;   // ISO YYYY-MM-DD inclusive
  campaignTypes: string[] | null;
}

/**
 * Build a SQL fragment listing campaign types as `IN ($1, $2, …)`.
 * Drizzle's `sql\`${array}\`` doesn't bind JS arrays as Postgres arrays
 * (it serializes them as strings, breaking ANY(array)). We construct the
 * IN list explicitly with one placeholder per element.
 */
function typesInClause(types: string[]): SQL {
  const placeholders = sql.join(types.map((t) => sql`${t}`), sql`, `);
  return sql`c.type IN (${placeholders})`;
}

function attributionWhere(args: FilterArgs): SQL {
  const conds: SQL[] = [
    sql`a.stage = 'sql'`,
    sql`a.model = ${args.model}`,
    sql`NOT c.is_deleted`,
  ];
  if (args.fromDate) conds.push(sql`a.transition_date >= ${args.fromDate}::date`);
  if (args.toDate)   conds.push(sql`a.transition_date <= ${args.toDate}::date`);
  if (args.campaignTypes && args.campaignTypes.length > 0) {
    conds.push(typesInClause(args.campaignTypes));
  }
  return sql.join(conds, sql` AND `);
}

// ---------------------------------------------------------------------------
// 1. Campaign Contribution to SQLs (top-N bar)
// ---------------------------------------------------------------------------

export interface CampaignContributionRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  sqlContacts: number;
  totalCredit: number;
}

export async function getCampaignContributionToSqls(
  args: FilterArgs,
  topN = 20,
): Promise<CampaignContributionRow[]> {
  const where = attributionWhere(args);
  const rows = await db.execute<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    sql_contacts: string | number;
    total_credit: string | number;
  }>(sql`
    SELECT
      c.id   AS campaign_id,
      c.name AS campaign_name,
      c.type AS campaign_type,
      COUNT(DISTINCT a.contact_id)        AS sql_contacts,
      COALESCE(SUM(a.credit), 0)::numeric AS total_credit
    FROM raw.sf_campaign c
    JOIN mart.attribution_contact a ON a.campaign_id = c.id
    WHERE ${where}
    GROUP BY c.id, c.name, c.type
    HAVING COUNT(DISTINCT a.contact_id) > 0
    ORDER BY total_credit DESC, c.name ASC
    LIMIT ${topN}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    campaignType: r.campaign_type,
    sqlContacts: Number(r.sql_contacts),
    totalCredit: Number(r.total_credit),
  }));
}

// ---------------------------------------------------------------------------
// 2. Campaign-Type Rollup (DASH-02 — same filters, grouped by type)
// ---------------------------------------------------------------------------

export interface CampaignTypeRollupRow {
  campaignType: string;
  totalCredit: number;
  sqlContacts: number;
  campaignCount: number;
}

export async function getCampaignTypeRollup(args: FilterArgs): Promise<CampaignTypeRollupRow[]> {
  const where = attributionWhere(args);
  const rows = await db.execute<{
    campaign_type: string | null;
    total_credit: string | number;
    sql_contacts: string | number;
    campaign_count: string | number;
  }>(sql`
    SELECT
      COALESCE(c.type, '(no type)')        AS campaign_type,
      COALESCE(SUM(a.credit), 0)::numeric  AS total_credit,
      COUNT(DISTINCT a.contact_id)         AS sql_contacts,
      COUNT(DISTINCT c.id)                 AS campaign_count
    FROM raw.sf_campaign c
    JOIN mart.attribution_contact a ON a.campaign_id = c.id
    WHERE ${where}
    GROUP BY COALESCE(c.type, '(no type)')
    HAVING COUNT(DISTINCT a.contact_id) > 0
    ORDER BY total_credit DESC
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    campaignType: r.campaign_type ?? "(no type)",
    totalCredit: Number(r.total_credit),
    sqlContacts: Number(r.sql_contacts),
    campaignCount: Number(r.campaign_count),
  }));
}

// ---------------------------------------------------------------------------
// 3. Engagement → SQL conversion rate (DASH-03 — sortable table)
//
// For each Campaign in scope, count:
//   - engaged_contacts: distinct CampaignMember Contacts (deduped via
//     mart.touchpoints) regardless of whether they ever became SQL
//   - sql_contributors: distinct Contacts who became SQL with this campaign
//     in their windowed in-credit set (under the active model)
// Conversion rate = sql_contributors / engaged_contacts.
//
// The "engaged" denominator does NOT date-restrict touchpoint timestamps,
// because the question is "how well does this campaign drive SQLs given who
// it reached" — restricting touchpoints muddies that. We DO restrict to
// transition-date for the numerator (matches the bar chart filter).
// ---------------------------------------------------------------------------

export interface ConversionRateRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  engagedContacts: number;
  sqlContributors: number;
  conversionRate: number; // 0..1
}

export async function getConversionRateTable(
  args: FilterArgs,
  topN = 50,
): Promise<ConversionRateRow[]> {
  // Match the numerator to the same model/date/type filters as the bar chart.
  const numeratorWhere = attributionWhere(args);
  const typeWhere = args.campaignTypes && args.campaignTypes.length > 0
    ? sql`AND ${typesInClause(args.campaignTypes)}`
    : sql``;

  const rows = await db.execute<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    engaged_contacts: string | number;
    sql_contributors: string | number;
  }>(sql`
    WITH engaged AS (
      SELECT t.campaign_id, COUNT(DISTINCT t.contact_id) AS n
        FROM mart.touchpoints t
        JOIN raw.sf_contact ct ON ct.id = t.contact_id
        JOIN raw.sf_campaign c  ON c.id  = t.campaign_id
       WHERE NOT ct.is_deleted AND NOT c.is_deleted
       ${typeWhere}
       GROUP BY t.campaign_id
    ),
    contributors AS (
      SELECT a.campaign_id, COUNT(DISTINCT a.contact_id) AS n
        FROM mart.attribution_contact a
        JOIN raw.sf_contact c_contact ON c_contact.id = a.contact_id
        JOIN raw.sf_campaign c        ON c.id         = a.campaign_id
       WHERE ${numeratorWhere}
       GROUP BY a.campaign_id
    )
    SELECT
      c.id   AS campaign_id,
      c.name AS campaign_name,
      c.type AS campaign_type,
      e.n    AS engaged_contacts,
      COALESCE(s.n, 0) AS sql_contributors
    FROM raw.sf_campaign c
    JOIN engaged e         ON e.campaign_id = c.id
    LEFT JOIN contributors s ON s.campaign_id = c.id
    WHERE NOT c.is_deleted AND e.n > 0
    ${typeWhere}
    ORDER BY (COALESCE(s.n, 0)::float / e.n) DESC, e.n DESC
    LIMIT ${topN}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => {
    const engaged = Number(r.engaged_contacts);
    const sqlc = Number(r.sql_contributors);
    return {
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      campaignType: r.campaign_type,
      engagedContacts: engaged,
      sqlContributors: sqlc,
      conversionRate: engaged > 0 ? sqlc / engaged : 0,
    };
  });
}

// ---------------------------------------------------------------------------
// 4. Available campaign types (for the filter UI)
// ---------------------------------------------------------------------------

export async function getAvailableCampaignTypes(): Promise<string[]> {
  const rows = await db.execute<{ type: string | null }>(sql`
    SELECT DISTINCT type FROM raw.sf_campaign
     WHERE NOT is_deleted AND type IS NOT NULL AND type <> ''
     ORDER BY type ASC
  `);
  return (rows as Array<{ type: string | null }>)
    .map((r) => r.type)
    .filter((t): t is string => t != null);
}
