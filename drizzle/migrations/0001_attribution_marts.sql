-- ============================================================================
-- Marketing BI — Phase 3 attribution marts
--
-- Creates:
--   1. Schema mart.*
--   2. mart.lifecycle_transitions   — derived per-stage transition dates
--                                      (MQL = first Presentation, SQL = SQL_Date__c,
--                                       Opp = first Opportunity via OCR,
--                                       Customer = first Closed Won via OCR)
--   3. mart.touchpoints             — deduped (contact_id, campaign_id) with
--                                      timestamp = COALESCE(first_responded, created)
--   4. mart.attribution_contact     — per-stage credit at MQL/SQL/Opp/Customer
--                                      for first/last/linear models
--   5. mart.attribution_account     — GROUP BY account_id rollup
--
-- All marts are MATERIALIZED VIEWS with a unique index so they support
-- REFRESH MATERIALIZED VIEW CONCURRENTLY (called from the cron at the end of
-- every sync run).
--
-- Idempotency: every CREATE uses IF NOT EXISTS / OR REPLACE; the matviews
-- use DROP MATERIALIZED VIEW IF EXISTS + CREATE since Postgres doesn't
-- support OR REPLACE on matviews directly. RESTRICT prevents accidental
-- cascades.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS mart;
GRANT USAGE ON SCHEMA mart TO authenticated;

-- ============================================================================
-- mart.lifecycle_transitions
--
-- One row per Contact with the four (potentially-null) transition dates.
-- Built once per refresh; downstream marts join against this for the
-- per-stage windowing.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.lifecycle_transitions CASCADE;

CREATE MATERIALIZED VIEW mart.lifecycle_transitions AS
WITH first_presentation AS (
    SELECT contact_id, MIN(created_date::date) AS dt
    FROM raw.sf_presentation
    WHERE NOT is_deleted AND contact_id IS NOT NULL
    GROUP BY contact_id
),
first_opportunity AS (
    SELECT ocr.contact_id, MIN(o.created_date::date) AS dt
    FROM raw.sf_opportunity_contact_role ocr
    JOIN raw.sf_opportunity o ON o.id = ocr.opportunity_id
    WHERE NOT ocr.is_deleted AND NOT o.is_deleted AND ocr.contact_id IS NOT NULL
    GROUP BY ocr.contact_id
),
first_customer AS (
    SELECT ocr.contact_id, MIN(o.close_date) AS dt
    FROM raw.sf_opportunity_contact_role ocr
    JOIN raw.sf_opportunity o ON o.id = ocr.opportunity_id
    WHERE NOT ocr.is_deleted AND NOT o.is_deleted
      AND ocr.contact_id IS NOT NULL
      AND o.is_won = true
      AND o.close_date IS NOT NULL
    GROUP BY ocr.contact_id
)
SELECT
    c.id                                                      AS contact_id,
    c.account_id                                              AS account_id,
    fp.dt                                                     AS mql_date,
    c.sql_date                                                AS sql_date,
    fo.dt                                                     AS opp_date,
    fc.dt                                                     AS customer_date
FROM raw.sf_contact c
LEFT JOIN first_presentation fp ON fp.contact_id = c.id
LEFT JOIN first_opportunity  fo ON fo.contact_id = c.id
LEFT JOIN first_customer     fc ON fc.contact_id = c.id
WHERE NOT c.is_deleted;

-- Unique index → required for REFRESH ... CONCURRENTLY
CREATE UNIQUE INDEX lifecycle_transitions_pk ON mart.lifecycle_transitions (contact_id);
CREATE INDEX lifecycle_transitions_account_idx ON mart.lifecycle_transitions (account_id);

-- ============================================================================
-- mart.touchpoints
--
-- ATTR-01: one row per (contact_id, campaign_id) pair, deduped.
-- Touchpoint timestamp is COALESCE(first_responded_date, created_date) of the
-- EARLIEST CampaignMember row.
-- ATTR-05: ALL CampaignMember statuses included (no filter to 'Responded').
-- ATTR-12: soft-delete filter applied.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.touchpoints CASCADE;

CREATE MATERIALIZED VIEW mart.touchpoints AS
SELECT
    cm.contact_id,
    cm.campaign_id,
    MIN(COALESCE(cm.first_responded_date, cm.created_date::date)) AS touchpoint_at
FROM raw.sf_campaign_member cm
WHERE NOT cm.is_deleted AND cm.contact_id IS NOT NULL AND cm.campaign_id IS NOT NULL
GROUP BY cm.contact_id, cm.campaign_id;

CREATE UNIQUE INDEX touchpoints_pk      ON mart.touchpoints (contact_id, campaign_id);
CREATE INDEX        touchpoints_camp_idx ON mart.touchpoints (campaign_id);
CREATE INDEX        touchpoints_at_idx   ON mart.touchpoints (touchpoint_at);

-- ============================================================================
-- mart.attribution_contact
--
-- Per (contact_id, campaign_id, stage, model) row with the credit weight.
-- Three models:
--   - first_touch   (1.0 to the first touchpoint within window per contact-stage)
--   - last_touch    (1.0 to the last  touchpoint within window per contact-stage)
--   - linear        (1/N to each touchpoint within window per contact-stage)
--
-- Window: 90 days strictly before the lifecycle transition date (ATTR-04, ATTR-06).
-- Per-stage independence: a contact who reached MQL/SQL/Opp/Customer accrues
-- credit at all four stages independently (ATTR-07).
--
-- For first/last models, ATTR-02 / ATTR-03 specify reading from
-- ops.contact_source_history as-of the transition date. This view's
-- "first_touch" / "last_touch" are CAMPAIGN-LEVEL credit (the campaign that
-- produced the first/last TOUCHPOINT). The ops.contact_source_history-based
-- LeadSource attribution is exposed separately if needed; for the
-- /dashboard/campaigns chart we use campaign-level credit because that's what
-- the chart visualizes.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.attribution_contact CASCADE;

CREATE MATERIALIZED VIEW mart.attribution_contact AS
WITH stages AS (
    SELECT contact_id, account_id, 'mql'::text      AS stage, mql_date      AS transition_date FROM mart.lifecycle_transitions WHERE mql_date      IS NOT NULL
    UNION ALL
    SELECT contact_id, account_id, 'sql'::text      AS stage, sql_date      AS transition_date FROM mart.lifecycle_transitions WHERE sql_date      IS NOT NULL
    UNION ALL
    SELECT contact_id, account_id, 'opp'::text      AS stage, opp_date      AS transition_date FROM mart.lifecycle_transitions WHERE opp_date      IS NOT NULL
    UNION ALL
    SELECT contact_id, account_id, 'customer'::text AS stage, customer_date AS transition_date FROM mart.lifecycle_transitions WHERE customer_date IS NOT NULL
),
windowed_touches AS (
    SELECT
        s.contact_id,
        s.account_id,
        s.stage,
        s.transition_date,
        tp.campaign_id,
        tp.touchpoint_at,
        ROW_NUMBER() OVER (
            PARTITION BY s.contact_id, s.stage
            ORDER BY tp.touchpoint_at ASC, tp.campaign_id ASC
        ) AS rn_first,
        ROW_NUMBER() OVER (
            PARTITION BY s.contact_id, s.stage
            ORDER BY tp.touchpoint_at DESC, tp.campaign_id DESC
        ) AS rn_last,
        COUNT(*) OVER (PARTITION BY s.contact_id, s.stage) AS touch_count
    FROM stages s
    JOIN mart.touchpoints tp ON tp.contact_id = s.contact_id
    -- 90-day window, strictly before the transition (ATTR-04, ATTR-06)
    WHERE tp.touchpoint_at <  s.transition_date
      AND tp.touchpoint_at >= s.transition_date - INTERVAL '90 days'
),
linear AS (
    SELECT
        contact_id, account_id, stage, transition_date, campaign_id,
        'linear'::text AS model,
        (1.0 / touch_count)::numeric(10,6) AS credit
    FROM windowed_touches
),
first_touch AS (
    SELECT
        contact_id, account_id, stage, transition_date, campaign_id,
        'first_touch'::text AS model,
        1.0::numeric(10,6)  AS credit
    FROM windowed_touches
    WHERE rn_first = 1
),
last_touch AS (
    SELECT
        contact_id, account_id, stage, transition_date, campaign_id,
        'last_touch'::text AS model,
        1.0::numeric(10,6) AS credit
    FROM windowed_touches
    WHERE rn_last = 1
)
SELECT * FROM linear
UNION ALL
SELECT * FROM first_touch
UNION ALL
SELECT * FROM last_touch;

CREATE UNIQUE INDEX attribution_contact_pk
    ON mart.attribution_contact (contact_id, stage, model, campaign_id);
CREATE INDEX attribution_contact_campaign_idx ON mart.attribution_contact (campaign_id);
CREATE INDEX attribution_contact_stage_idx    ON mart.attribution_contact (stage);
CREATE INDEX attribution_contact_model_idx    ON mart.attribution_contact (model);
CREATE INDEX attribution_contact_account_idx  ON mart.attribution_contact (account_id);

-- ============================================================================
-- mart.attribution_account
--
-- Account-level rollup of contact attribution. Per ATTR-08, this is a simple
-- GROUP BY account_id from mart.attribution_contact. Per ATTR-09 (relaxed in
-- v1 — see CONTEXT.md), we use the CURRENT account_id from raw.sf_contact
-- (already encoded into mart.attribution_contact). When account_id history
-- snapshotting ships, this view becomes a strict point-in-time rollup.
--
-- Closed Won OCR equal-split (ATTR-11) is an Opportunity-level concept; this
-- view doesn't model it directly because Phase 1 chart doesn't need revenue
-- yet. Phase 4 (G4 Revenue dashboard) will introduce mart.opportunity_credit
-- which applies the OCR split.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.attribution_account CASCADE;

CREATE MATERIALIZED VIEW mart.attribution_account AS
SELECT
    account_id,
    stage,
    model,
    campaign_id,
    SUM(credit)             AS credit,
    COUNT(DISTINCT contact_id) AS contact_count
FROM mart.attribution_contact
WHERE account_id IS NOT NULL
GROUP BY account_id, stage, model, campaign_id;

CREATE UNIQUE INDEX attribution_account_pk
    ON mart.attribution_account (account_id, stage, model, campaign_id);
CREATE INDEX attribution_account_campaign_idx ON mart.attribution_account (campaign_id);
CREATE INDEX attribution_account_stage_idx    ON mart.attribution_account (stage);
CREATE INDEX attribution_account_model_idx    ON mart.attribution_account (model);

-- ============================================================================
-- Grants — authenticated users (the dashboard layer) need SELECT on the marts.
-- The cron sync uses service-role and bypasses RLS.
-- ============================================================================

GRANT SELECT ON mart.lifecycle_transitions  TO authenticated;
GRANT SELECT ON mart.touchpoints            TO authenticated;
GRANT SELECT ON mart.attribution_contact    TO authenticated;
GRANT SELECT ON mart.attribution_account    TO authenticated;
