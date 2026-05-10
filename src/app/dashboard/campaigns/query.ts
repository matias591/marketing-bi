/**
 * Campaign Contribution to SQLs — Phase 1 query.
 *
 * Computes, for each Campaign, the count of distinct Contacts whose
 * `sql_date` falls AFTER they became a CampaignMember. Phase 1 uses a
 * hand-written CTE against `raw.sf_*`. Phase 3 will replace this with
 * `mart.attribution_contact` reads, with the full 90-day window + per-stage
 * independence + first/last/linear logic.
 *
 * Naive Phase 1 semantics (linear-ish, no model toggle):
 *   - Filter out soft-deleted records (Pitfall 12).
 *   - Filter to Contacts where `sql_date IS NOT NULL`.
 *   - Join to CampaignMember rows where the touchpoint timestamp
 *     (COALESCE(first_responded_date, created_date)) is strictly < sql_date.
 *   - Count distinct Contacts per Campaign — this is the "contribution".
 *   - Top-N by count, descending.
 *
 * This intentionally undercounts vs. the eventual P3 marts (no 90-day window,
 * no per-stage credit). Phase 1's job is to PROVE the pipeline; the
 * methodology page (P3) will document the production semantics.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

export interface CampaignContributionRow {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  sqlContacts: number;
}

export async function getCampaignContributionToSqls(
  topN = 20,
): Promise<CampaignContributionRow[]> {
  const rows = await db.execute<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    sql_contacts: string | number;
  }>(sql`
    WITH valid_contacts AS (
      SELECT id, sql_date
      FROM raw.sf_contact
      WHERE NOT is_deleted
        AND sql_date IS NOT NULL
    ),
    valid_members AS (
      SELECT
        cm.contact_id,
        cm.campaign_id,
        COALESCE(cm.first_responded_date, cm.created_date::date) AS touchpoint_at
      FROM raw.sf_campaign_member cm
      WHERE NOT cm.is_deleted
        AND cm.contact_id IS NOT NULL
    ),
    credited AS (
      SELECT DISTINCT vm.campaign_id, vm.contact_id
      FROM valid_members vm
      JOIN valid_contacts vc
        ON vc.id = vm.contact_id
      WHERE vm.touchpoint_at < vc.sql_date
    )
    SELECT
      c.id        AS campaign_id,
      c.name      AS campaign_name,
      c.type      AS campaign_type,
      COUNT(DISTINCT cr.contact_id) AS sql_contacts
    FROM raw.sf_campaign c
    LEFT JOIN credited cr ON cr.campaign_id = c.id
    WHERE NOT c.is_deleted
    GROUP BY c.id, c.name, c.type
    HAVING COUNT(DISTINCT cr.contact_id) > 0
    ORDER BY sql_contacts DESC, c.name ASC
    LIMIT ${topN}
  `);

  return (rows as Array<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    sql_contacts: string | number;
  }>).map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    campaignType: r.campaign_type,
    sqlContacts: Number(r.sql_contacts),
  }));
}
