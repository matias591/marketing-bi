/**
 * /dashboard/accounts queries — Phase 5A (G3).
 *
 * Two queries:
 *   1. Account leaderboard — per Account: engaged contacts (any touchpoint),
 *      SQL contacts (reached SQL stage), Closed Won revenue (sum from
 *      mart.opportunity_credit), last-touch date.
 *   2. Campaigns influencing accounts — per Campaign: distinct Account count
 *      based on touchpoint-stream membership.
 *
 * Filters: model (for revenue column), date range (transitions/close dates),
 * campaign types.
 *
 * The leaderboard's "last_touch_at" is the latest touchpoint timestamp across
 * any Contact in the Account — not date-filtered (the leaderboard answers
 * "which accounts are most engaged overall, recent activity included").
 */
import { db } from "@/db";
import { sql, type SQL } from "drizzle-orm";
import type { AttributionModel } from "@/lib/dashboard-filters";

interface AccountsFilterArgs {
  model: AttributionModel;
  fromDate: string | null;
  toDate: string | null;
  campaignTypes: string[] | null;
}

function typesInClause(types: string[]): SQL {
  const placeholders = sql.join(types.map((t) => sql`${t}`), sql`, `);
  return sql`c.type IN (${placeholders})`;
}

// ---------------------------------------------------------------------------
// 1. Account leaderboard
// ---------------------------------------------------------------------------

export interface AccountLeaderboardRow {
  accountId: string;
  accountName: string | null;
  engagedContacts: number;
  sqlContacts: number;
  closedWonRevenue: number;
  lastTouchAt: string | null;
}

export async function getAccountLeaderboard(
  args: AccountsFilterArgs,
  topN = 50,
): Promise<AccountLeaderboardRow[]> {
  const typeJoinFilter = args.campaignTypes && args.campaignTypes.length > 0
    ? sql`AND ${typesInClause(args.campaignTypes)}`
    : sql``;
  const dateFilterSql = (col: SQL) => sql.join(
    [
      args.fromDate ? sql`${col} >= ${args.fromDate}::date` : null,
      args.toDate ? sql`${col} <= ${args.toDate}::date` : null,
    ].filter((c): c is SQL => c !== null),
    sql` AND `,
  );

  const sqlDateFilter = args.fromDate || args.toDate
    ? sql`AND ${dateFilterSql(sql`ct.sql_date`)}`
    : sql``;
  const closeDateFilter = args.fromDate || args.toDate
    ? sql`AND ${dateFilterSql(sql`oc.close_date`)}`
    : sql``;

  const rows = await db.execute<{
    account_id: string;
    account_name: string | null;
    engaged_contacts: string | number;
    sql_contacts: string | number;
    closed_won_revenue: string | number | null;
    last_touch_at: string | null;
  }>(sql`
    WITH engaged AS (
      SELECT ct.account_id, COUNT(DISTINCT ct.id) AS n
        FROM raw.sf_contact ct
        JOIN mart.touchpoints t ON t.contact_id = ct.id
        JOIN raw.sf_campaign c  ON c.id = t.campaign_id
       WHERE NOT ct.is_deleted AND NOT c.is_deleted
         AND ct.account_id IS NOT NULL
       ${typeJoinFilter}
       GROUP BY ct.account_id
    ),
    sql_contacts AS (
      SELECT ct.account_id, COUNT(DISTINCT ct.id) AS n
        FROM raw.sf_contact ct
       WHERE NOT ct.is_deleted
         AND ct.sql_date IS NOT NULL
         AND ct.account_id IS NOT NULL
         ${sqlDateFilter}
       GROUP BY ct.account_id
    ),
    revenue AS (
      SELECT oc.account_id, SUM(oc.revenue_credit) AS r
        FROM mart.opportunity_credit oc
        JOIN raw.sf_campaign c ON c.id = oc.campaign_id
       WHERE oc.model = ${args.model} AND NOT c.is_deleted
         ${closeDateFilter}
         ${args.campaignTypes && args.campaignTypes.length > 0 ? sql`AND ${typesInClause(args.campaignTypes)}` : sql``}
       GROUP BY oc.account_id
    ),
    last_touch AS (
      SELECT ct.account_id, MAX(t.touchpoint_at) AS lt
        FROM raw.sf_contact ct
        JOIN mart.touchpoints t ON t.contact_id = ct.id
       WHERE NOT ct.is_deleted AND ct.account_id IS NOT NULL
       GROUP BY ct.account_id
    )
    SELECT
      a.id                   AS account_id,
      a.name                 AS account_name,
      COALESCE(e.n, 0)       AS engaged_contacts,
      COALESCE(sc.n, 0)      AS sql_contacts,
      COALESCE(r.r, 0)       AS closed_won_revenue,
      lt.lt::text            AS last_touch_at
    FROM raw.sf_account a
    LEFT JOIN engaged     e  ON e.account_id  = a.id
    LEFT JOIN sql_contacts sc ON sc.account_id = a.id
    LEFT JOIN revenue     r  ON r.account_id  = a.id
    LEFT JOIN last_touch  lt ON lt.account_id = a.id
    WHERE NOT a.is_deleted
      AND (COALESCE(e.n,0) > 0 OR COALESCE(sc.n,0) > 0 OR COALESCE(r.r,0) > 0)
    ORDER BY closed_won_revenue DESC, sql_contacts DESC, engaged_contacts DESC
    LIMIT ${topN}
  `);

  return (rows as Array<typeof rows[number]>).map((r) => ({
    accountId: r.account_id,
    accountName: r.account_name,
    engagedContacts: Number(r.engaged_contacts),
    sqlContacts: Number(r.sql_contacts),
    closedWonRevenue: Number(r.closed_won_revenue ?? 0),
    lastTouchAt: r.last_touch_at,
  }));
}

// ---------------------------------------------------------------------------
// 2. Campaigns influencing accounts (DASH-08)
// ---------------------------------------------------------------------------

export interface AccountsInfluencedRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  influencedAccounts: number;
}

export async function getCampaignsInfluencingAccounts(
  args: AccountsFilterArgs,
  topN = 20,
): Promise<AccountsInfluencedRow[]> {
  const typeFilter = args.campaignTypes && args.campaignTypes.length > 0
    ? sql`AND ${typesInClause(args.campaignTypes)}`
    : sql``;
  // The "influenced accounts" universe is determined by attribution (so it
  // honors model + date filters). Otherwise we'd be back to the same metric
  // as the campaigns dashboard's bar chart.
  const dateFilter = sql.join(
    [
      args.fromDate ? sql`a.transition_date >= ${args.fromDate}::date` : null,
      args.toDate ? sql`a.transition_date <= ${args.toDate}::date` : null,
    ].filter((c): c is SQL => c !== null),
    sql` AND `,
  );
  const dateClause = args.fromDate || args.toDate ? sql`AND ${dateFilter}` : sql``;

  const rows = await db.execute<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    influenced_accounts: string | number;
  }>(sql`
    SELECT
      c.id   AS campaign_id,
      c.name AS campaign_name,
      c.type AS campaign_type,
      COUNT(DISTINCT a.account_id) AS influenced_accounts
    FROM raw.sf_campaign c
    JOIN mart.attribution_contact a ON a.campaign_id = c.id
    WHERE a.stage = 'sql'
      AND a.model = ${args.model}
      AND NOT c.is_deleted
      AND a.account_id IS NOT NULL
      ${dateClause}
      ${typeFilter}
    GROUP BY c.id, c.name, c.type
    HAVING COUNT(DISTINCT a.account_id) > 0
    ORDER BY influenced_accounts DESC, c.name ASC
    LIMIT ${topN}
  `);

  return (rows as Array<typeof rows[number]>).map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    campaignType: r.campaign_type,
    influencedAccounts: Number(r.influenced_accounts),
  }));
}
