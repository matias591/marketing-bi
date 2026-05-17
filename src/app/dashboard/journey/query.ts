/**
 * /dashboard/journey queries — Phase 5B (G2 Contact Journey).
 *
 * Modes the page supports:
 *   - ?contactId=X  → full timeline + lifecycle milestones for one Contact
 *   - ?accountId=X  → list of contacts in that account (drill-down from G3)
 *   - ?q=<search>   → contact search by name or email
 *
 * Plus the common-journey aggregation (DASH-06): most frequent
 * (first_type, last_type) pairs across all SQL-stage Contacts.
 */
import { db } from "@/db";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Contact lookup helpers
// ---------------------------------------------------------------------------

export interface ContactSummary {
  id: string;
  name: string;
  email: string | null;
  accountId: string | null;
  accountName: string | null;
  lifecycleStage: string | null;
  mqlDate: string | null;
  sqlDate: string | null;
  oppDate: string | null;
  customerDate: string | null;
}

export async function getContact(contactId: string): Promise<ContactSummary | null> {
  const rows = await db.execute<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    account_id: string | null;
    account_name: string | null;
    lifecycle_stage: string | null;
    mql_date: string | null;
    sql_date: string | null;
    opp_date: string | null;
    customer_date: string | null;
  }>(sql`
    SELECT
      c.id,
      c.first_name, c.last_name, c.email,
      c.account_id, a.name AS account_name,
      c.lifecycle_stage,
      lt.mql_date::text       AS mql_date,
      c.sql_date::text        AS sql_date,
      lt.opp_date::text       AS opp_date,
      lt.customer_date::text  AS customer_date
    FROM raw.sf_contact c
    LEFT JOIN raw.sf_account a ON a.id = c.account_id
    LEFT JOIN mart.lifecycle_transitions lt ON lt.contact_id = c.id
    WHERE c.id = ${contactId}
    LIMIT 1
  `);
  const r = (rows as Array<typeof rows[number]>)[0];
  if (!r) return null;
  return {
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || r.id,
    email: r.email,
    accountId: r.account_id,
    accountName: r.account_name,
    lifecycleStage: r.lifecycle_stage,
    mqlDate: r.mql_date,
    sqlDate: r.sql_date,
    oppDate: r.opp_date,
    customerDate: r.customer_date,
  };
}

export interface ContactSearchRow {
  id: string;
  name: string;
  email: string | null;
  accountName: string | null;
  lifecycleStage: string | null;
  sqlDate: string | null;
}

export async function searchContacts(query: string, limit = 25): Promise<ContactSearchRow[]> {
  const term = `%${query.toLowerCase().replace(/[%_]/g, "")}%`;
  const rows = await db.execute<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    account_name: string | null;
    lifecycle_stage: string | null;
    sql_date: string | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, c.email,
           a.name AS account_name, c.lifecycle_stage, c.sql_date::text AS sql_date
      FROM raw.sf_contact c
      LEFT JOIN raw.sf_account a ON a.id = c.account_id
     WHERE NOT c.is_deleted
       AND (
         LOWER(COALESCE(c.first_name, '')) LIKE ${term}
         OR LOWER(COALESCE(c.last_name, '')) LIKE ${term}
         OR LOWER(COALESCE(c.email, ''))     LIKE ${term}
       )
     ORDER BY c.last_modified_date DESC NULLS LAST
     LIMIT ${limit}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || r.id,
    email: r.email,
    accountName: r.account_name,
    lifecycleStage: r.lifecycle_stage,
    sqlDate: r.sql_date,
  }));
}

export async function getAccountContacts(accountId: string, limit = 100): Promise<ContactSearchRow[]> {
  const rows = await db.execute<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    account_name: string | null;
    lifecycle_stage: string | null;
    sql_date: string | null;
  }>(sql`
    SELECT c.id, c.first_name, c.last_name, c.email,
           a.name AS account_name, c.lifecycle_stage, c.sql_date::text AS sql_date
      FROM raw.sf_contact c
      LEFT JOIN raw.sf_account a ON a.id = c.account_id
     WHERE c.account_id = ${accountId} AND NOT c.is_deleted
     ORDER BY (c.sql_date IS NOT NULL) DESC, c.last_modified_date DESC NULLS LAST
     LIMIT ${limit}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    id: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || r.id,
    email: r.email,
    accountName: r.account_name,
    lifecycleStage: r.lifecycle_stage,
    sqlDate: r.sql_date,
  }));
}

export async function getAccount(accountId: string): Promise<{ id: string; name: string | null } | null> {
  const rows = await db.execute<{ id: string; name: string | null }>(sql`
    SELECT id, name FROM raw.sf_account WHERE id = ${accountId} LIMIT 1
  `);
  return (rows as Array<{ id: string; name: string | null }>)[0] ?? null;
}

// ---------------------------------------------------------------------------
// Timeline: all touchpoints for one Contact (no filter — full history)
// ---------------------------------------------------------------------------

export interface TimelineEvent {
  campaignId: string;
  campaignName: string | null;
  campaignType: string | null;
  status: string | null;
  touchpointAt: string;
}

export async function getContactTimeline(contactId: string): Promise<TimelineEvent[]> {
  const rows = await db.execute<{
    campaign_id: string;
    campaign_name: string | null;
    campaign_type: string | null;
    status: string | null;
    touchpoint_at: string;
  }>(sql`
    SELECT
      cm.campaign_id,
      c.name AS campaign_name,
      c.type AS campaign_type,
      cm.status,
      COALESCE(cm.first_responded_date::text, cm.created_date::date::text) AS touchpoint_at
    FROM raw.sf_campaign_member cm
    JOIN raw.sf_campaign c ON c.id = cm.campaign_id
    WHERE cm.contact_id = ${contactId}
      AND NOT cm.is_deleted AND NOT c.is_deleted
    ORDER BY touchpoint_at ASC, cm.created_date ASC
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    campaignType: r.campaign_type,
    status: r.status,
    touchpointAt: r.touchpoint_at,
  }));
}

// ---------------------------------------------------------------------------
// Common journeys (DASH-06): top-N (first_type, last_type) pairs leading to SQL
//
// For every Contact who reached SQL, we look at their in-window touchpoints
// (90 days before sql_date) and record (first campaign type touched, last
// campaign type touched). Then we count pair frequency.
// ---------------------------------------------------------------------------

export interface CommonJourneyRow {
  firstType: string;
  lastType: string;
  contacts: number;
}

export async function getCommonJourneys(topN = 15): Promise<CommonJourneyRow[]> {
  const rows = await db.execute<{
    first_type: string;
    last_type: string;
    contacts: string | number;
  }>(sql`
    WITH windowed AS (
      SELECT
        c.id          AS contact_id,
        c.sql_date,
        t.campaign_id,
        camp.type     AS campaign_type,
        t.touchpoint_at,
        ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.touchpoint_at ASC,  t.campaign_id ASC)  AS rn_first,
        ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.touchpoint_at DESC, t.campaign_id DESC) AS rn_last
      FROM raw.sf_contact c
      JOIN mart.touchpoints t ON t.contact_id = c.id
      JOIN raw.sf_campaign camp ON camp.id = t.campaign_id
      WHERE NOT c.is_deleted
        AND c.sql_date IS NOT NULL
        AND camp.type IS NOT NULL
        AND t.touchpoint_at <  c.sql_date
        AND t.touchpoint_at >= c.sql_date - INTERVAL '1 year'
    ),
    firsts AS (
      SELECT contact_id, campaign_type AS first_type FROM windowed WHERE rn_first = 1
    ),
    lasts AS (
      SELECT contact_id, campaign_type AS last_type  FROM windowed WHERE rn_last  = 1
    )
    SELECT f.first_type, l.last_type, COUNT(*) AS contacts
      FROM firsts f
      JOIN lasts  l ON l.contact_id = f.contact_id
     GROUP BY f.first_type, l.last_type
     ORDER BY contacts DESC, f.first_type, l.last_type
     LIMIT ${topN}
  `);
  return (rows as Array<typeof rows[number]>).map((r) => ({
    firstType: r.first_type,
    lastType: r.last_type,
    contacts: Number(r.contacts),
  }));
}
