/**
 * /dashboard/revenue queries — Phase 4B (G4).
 *
 * Reads from `mart.opportunity_credit` which already encodes:
 *   - ATTR-11 OCR equal-split per Closed Won Opp
 *   - Customer-stage attribution credit weights (linear / first / last)
 *
 * Filter dimensions:
 *   - model (linear / first_touch / last_touch)
 *   - close_date range (when the Opp closed-won)
 *   - campaign type set
 */
import { db } from "@/db";
import { sql, type SQL } from "drizzle-orm";
import type { AttributionModel } from "@/lib/dashboard-filters";

interface RevenueFilterArgs {
  model: AttributionModel;
  fromDate: string | null;
  toDate: string | null;
  campaignTypes: string[] | null;
}

function typesInClause(types: string[]): SQL {
  const placeholders = sql.join(types.map((t) => sql`${t}`), sql`, `);
  return sql`c.type IN (${placeholders})`;
}

function revenueWhere(args: RevenueFilterArgs, modelMode: "single" | "all" = "single"): SQL {
  const conds: SQL[] = [sql`NOT c.is_deleted`];
  if (modelMode === "single") conds.push(sql`r.model = ${args.model}`);
  if (args.fromDate) conds.push(sql`r.close_date >= ${args.fromDate}::date`);
  if (args.toDate)   conds.push(sql`r.close_date <= ${args.toDate}::date`);
  if (args.campaignTypes && args.campaignTypes.length > 0) {
    conds.push(typesInClause(args.campaignTypes));
  }
  return sql.join(conds, sql` AND `);
}

// ---------------------------------------------------------------------------
// 1. Revenue by Campaign (top-N)
// ---------------------------------------------------------------------------

export interface RevenueByCampaignRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  revenue: number;       // attributed revenue $
  influencedOpps: number;
  influencedAccounts: number;
}

export async function getRevenueByCampaign(
  args: RevenueFilterArgs,
  topN = 20,
): Promise<RevenueByCampaignRow[]> {
  const where = revenueWhere(args);
  const rows = await db.execute<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    revenue: string | number;
    influenced_opps: string | number;
    influenced_accounts: string | number;
  }>(sql`
    SELECT
      c.id   AS campaign_id,
      c.name AS campaign_name,
      c.type AS campaign_type,
      COALESCE(SUM(r.revenue_credit), 0)::numeric AS revenue,
      COUNT(DISTINCT r.opportunity_id)            AS influenced_opps,
      COUNT(DISTINCT r.account_id)                AS influenced_accounts
    FROM raw.sf_campaign c
    JOIN mart.opportunity_credit r ON r.campaign_id = c.id
    WHERE ${where}
    GROUP BY c.id, c.name, c.type
    HAVING SUM(r.revenue_credit) > 0
    ORDER BY revenue DESC, c.name ASC
    LIMIT ${topN}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    campaignType: r.campaign_type,
    revenue: Number(r.revenue),
    influencedOpps: Number(r.influenced_opps),
    influencedAccounts: Number(r.influenced_accounts),
  }));
}

// ---------------------------------------------------------------------------
// 2. Revenue by Campaign Type (rollup)
// ---------------------------------------------------------------------------

export interface RevenueByTypeRow {
  campaignType: string;
  revenue: number;
  pctOfTotal: number;
  campaignCount: number;
  influencedOpps: number;
}

export async function getRevenueByCampaignType(args: RevenueFilterArgs): Promise<RevenueByTypeRow[]> {
  const where = revenueWhere(args);
  const rows = await db.execute<{
    campaign_type: string | null;
    revenue: string | number;
    campaign_count: string | number;
    influenced_opps: string | number;
  }>(sql`
    SELECT
      COALESCE(c.type, '(no type)')              AS campaign_type,
      COALESCE(SUM(r.revenue_credit), 0)::numeric AS revenue,
      COUNT(DISTINCT c.id)                       AS campaign_count,
      COUNT(DISTINCT r.opportunity_id)           AS influenced_opps
    FROM raw.sf_campaign c
    JOIN mart.opportunity_credit r ON r.campaign_id = c.id
    WHERE ${where}
    GROUP BY COALESCE(c.type, '(no type)')
    HAVING SUM(r.revenue_credit) > 0
    ORDER BY revenue DESC
  `);
  const records = rows as Array<typeof rows[number]>;
  const total = records.reduce((sum, r) => sum + Number(r.revenue), 0);
  return records.map((r) => {
    const rev = Number(r.revenue);
    return {
      campaignType: r.campaign_type ?? "(no type)",
      revenue: rev,
      pctOfTotal: total > 0 ? rev / total : 0,
      campaignCount: Number(r.campaign_count),
      influencedOpps: Number(r.influenced_opps),
    };
  });
}

// Multi-model comparison: per campaign, revenue under all 3 models (DASH-12)
export interface RevenueComparisonRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  revenueByModel: { linear: number; first_touch: number; last_touch: number };
}

export async function getRevenueByCampaignComparison(
  args: RevenueFilterArgs,
  topN = 20,
): Promise<RevenueComparisonRow[]> {
  const where = revenueWhere(args, "all");
  const rows = await db.execute<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    linear_rev: string | number | null;
    first_rev: string | number | null;
    last_rev: string | number | null;
  }>(sql`
    SELECT
      c.id   AS campaign_id,
      c.name AS campaign_name,
      c.type AS campaign_type,
      COALESCE(SUM(r.revenue_credit) FILTER (WHERE r.model = 'linear'), 0)::numeric      AS linear_rev,
      COALESCE(SUM(r.revenue_credit) FILTER (WHERE r.model = 'first_touch'), 0)::numeric AS first_rev,
      COALESCE(SUM(r.revenue_credit) FILTER (WHERE r.model = 'last_touch'), 0)::numeric  AS last_rev
    FROM raw.sf_campaign c
    JOIN mart.opportunity_credit r ON r.campaign_id = c.id
    WHERE ${where}
    GROUP BY c.id, c.name, c.type
    HAVING SUM(r.revenue_credit) FILTER (WHERE r.model = 'linear') > 0
    ORDER BY linear_rev DESC, c.name ASC
    LIMIT ${topN}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    campaignType: r.campaign_type,
    revenueByModel: {
      linear: Number(r.linear_rev ?? 0),
      first_touch: Number(r.first_rev ?? 0),
      last_touch: Number(r.last_rev ?? 0),
    },
  }));
}

// Revenue by type comparison
export interface RevenueByTypeComparisonRow {
  campaignType: string;
  revenueByModel: { linear: number; first_touch: number; last_touch: number };
}

export async function getRevenueByCampaignTypeComparison(args: RevenueFilterArgs): Promise<RevenueByTypeComparisonRow[]> {
  const where = revenueWhere(args, "all");
  const rows = await db.execute<{
    campaign_type: string | null;
    linear_rev: string | number | null;
    first_rev: string | number | null;
    last_rev: string | number | null;
  }>(sql`
    SELECT
      COALESCE(c.type, '(no type)')                                                      AS campaign_type,
      COALESCE(SUM(r.revenue_credit) FILTER (WHERE r.model = 'linear'), 0)::numeric      AS linear_rev,
      COALESCE(SUM(r.revenue_credit) FILTER (WHERE r.model = 'first_touch'), 0)::numeric AS first_rev,
      COALESCE(SUM(r.revenue_credit) FILTER (WHERE r.model = 'last_touch'), 0)::numeric  AS last_rev
    FROM raw.sf_campaign c
    JOIN mart.opportunity_credit r ON r.campaign_id = c.id
    WHERE ${where}
    GROUP BY COALESCE(c.type, '(no type)')
    HAVING SUM(r.revenue_credit) FILTER (WHERE r.model = 'linear') > 0
    ORDER BY linear_rev DESC
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    campaignType: r.campaign_type ?? "(no type)",
    revenueByModel: {
      linear: Number(r.linear_rev ?? 0),
      first_touch: Number(r.first_rev ?? 0),
      last_touch: Number(r.last_rev ?? 0),
    },
  }));
}

// Exclusion counts for revenue (DASH-13)
export interface RevenueExclusionCounts {
  total: number;
  included: number;
  reasons: Array<{ label: string; count: number; detail?: string }>;
}

export async function getRevenueExclusionCounts(args: RevenueFilterArgs): Promise<RevenueExclusionCounts> {
  const dateClause = sql.join(
    [
      args.fromDate ? sql`o.close_date >= ${args.fromDate}::date` : null,
      args.toDate ? sql`o.close_date <= ${args.toDate}::date` : null,
    ].filter((c): c is SQL => c !== null),
    sql` AND `,
  );
  const dateFilter = args.fromDate || args.toDate ? sql`AND ${dateClause}` : sql``;

  const rows = await db.execute<{
    total: string | number;
    no_amount: string | number;
    no_ocr: string | number;
    no_attribution: string | number;
    included: string | number;
  }>(sql`
    WITH won AS (
      SELECT o.id, o.amount FROM raw.sf_opportunity o
       WHERE NOT o.is_deleted AND o.is_won = true ${dateFilter}
    ),
    with_ocr AS (
      SELECT DISTINCT w.id FROM won w
        JOIN raw.sf_opportunity_contact_role ocr
          ON ocr.opportunity_id = w.id AND NOT ocr.is_deleted AND ocr.contact_id IS NOT NULL
    ),
    in_mart AS (
      SELECT DISTINCT opportunity_id AS id FROM mart.opportunity_credit
       WHERE 1=1
       ${args.fromDate ? sql`AND close_date >= ${args.fromDate}::date` : sql``}
       ${args.toDate   ? sql`AND close_date <= ${args.toDate}::date`   : sql``}
    )
    SELECT
      (SELECT COUNT(*) FROM won)                                                  AS total,
      (SELECT COUNT(*) FROM won WHERE amount IS NULL)                             AS no_amount,
      (SELECT COUNT(*) FROM won WHERE amount IS NOT NULL
         AND id NOT IN (SELECT id FROM with_ocr))                                 AS no_ocr,
      (SELECT COUNT(*) FROM with_ocr WHERE id NOT IN (SELECT id FROM in_mart))    AS no_attribution,
      (SELECT COUNT(*) FROM in_mart)                                              AS included
  `);
  const r = (rows as Array<typeof rows[number]>)[0];
  return {
    total: Number(r?.total ?? 0),
    included: Number(r?.included ?? 0),
    reasons: [
      { label: "no Opp amount", count: Number(r?.no_amount ?? 0), detail: "amount is NULL — no revenue to attribute" },
      { label: "no OpportunityContactRole", count: Number(r?.no_ocr ?? 0), detail: "no OCR contact to credit" },
      { label: "OCR contacts have no customer-stage attribution", count: Number(r?.no_attribution ?? 0), detail: "contacts never had pre-customer touchpoints in the 90-day window" },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. Headline metrics (KPI strip)
// ---------------------------------------------------------------------------

export interface RevenueHeadline {
  totalRevenue: number;
  influencedOpps: number;
  influencedAccounts: number;
  influencedContacts: number;
}

export async function getRevenueHeadline(args: RevenueFilterArgs): Promise<RevenueHeadline> {
  const where = revenueWhere(args);
  const rows = await db.execute<{
    total_revenue: string | number;
    influenced_opps: string | number;
    influenced_accounts: string | number;
    influenced_contacts: string | number;
  }>(sql`
    SELECT
      COALESCE(SUM(r.revenue_credit), 0)::numeric AS total_revenue,
      COUNT(DISTINCT r.opportunity_id)            AS influenced_opps,
      COUNT(DISTINCT r.account_id)                AS influenced_accounts,
      COUNT(DISTINCT r.contact_id)                AS influenced_contacts
    FROM raw.sf_campaign c
    JOIN mart.opportunity_credit r ON r.campaign_id = c.id
    WHERE ${where}
  `);
  const row = (rows as Array<typeof rows[number]>)[0];
  return {
    totalRevenue: Number(row?.total_revenue ?? 0),
    influencedOpps: Number(row?.influenced_opps ?? 0),
    influencedAccounts: Number(row?.influenced_accounts ?? 0),
    influencedContacts: Number(row?.influenced_contacts ?? 0),
  };
}
