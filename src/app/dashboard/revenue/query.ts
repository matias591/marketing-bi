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

function revenueWhere(args: RevenueFilterArgs): SQL {
  const conds: SQL[] = [
    sql`r.model = ${args.model}`,
    sql`NOT c.is_deleted`,
  ];
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
