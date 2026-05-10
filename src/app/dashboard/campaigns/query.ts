/**
 * Campaign Contribution to SQLs — Phase 3 query.
 *
 * Reads from `mart.attribution_contact` (the methodology-locked attribution
 * model) instead of Phase 1's hand-written SQL against raw.sf_*. The chart
 * shows distinct Contact count credited to each Campaign at the SQL stage
 * under the linear multi-touch model. Toggle to first/last/linear in P4.
 *
 * Phase 1's naive "any touchpoint before sql_date" rule is replaced by:
 *   - 90-day window strictly before sql_date (ATTR-04, ATTR-06)
 *   - Per-stage independent credit (ATTR-07) — this query asks for SQL stage
 *   - Linear-multi-touch credit per touchpoint (ATTR-04)
 *   - Soft-delete filter at the Contact level (ATTR-10)
 *   - All CampaignMember statuses (ATTR-05)
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface CampaignContributionRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  sqlContacts: number;
  totalCredit: number;
}

export type AttributionModel = "first_touch" | "last_touch" | "linear";

export async function getCampaignContributionToSqls(
  topN = 20,
  model: AttributionModel = "linear",
): Promise<CampaignContributionRow[]> {
  const rows = await db.execute<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    sql_contacts: string | number;
    total_credit: string | number;
  }>(sql`
    SELECT
      c.id          AS campaign_id,
      c.name        AS campaign_name,
      c.type        AS campaign_type,
      COUNT(DISTINCT a.contact_id)     AS sql_contacts,
      COALESCE(SUM(a.credit), 0)::numeric AS total_credit
    FROM raw.sf_campaign c
    LEFT JOIN mart.attribution_contact a
      ON a.campaign_id = c.id AND a.stage = 'sql' AND a.model = ${model}
    WHERE NOT c.is_deleted
    GROUP BY c.id, c.name, c.type
    HAVING COUNT(DISTINCT a.contact_id) > 0
    ORDER BY total_credit DESC, c.name ASC
    LIMIT ${topN}
  `);

  return (rows as Array<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    sql_contacts: string | number;
    total_credit: string | number;
  }>).map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    campaignType: r.campaign_type,
    sqlContacts: Number(r.sql_contacts),
    totalCredit: Number(r.total_credit),
  }));
}
