-- ============================================================================
-- Marketing BI — Phase spec-alignment (2026-05-17 business call)
--
-- Changes:
--   1. mart.touchpoints — add status filter: only Registered / Attended /
--      Responded qualify as touch points. Invited, Email Opened, and
--      Rejected/No Response are excluded (bot risk / no active engagement).
--
--   2. mart.attribution_contact — three changes:
--      a. Window extended from 90 days to 12 months.
--      b. Window is now anchored to sql_date for ALL stages (not each
--         stage's own transition date). Rationale: MQL→SQL can take time;
--         SQL→Opp typically <1 month; SQL→Customer up to 6+ months. One year
--         from SQL covers all cases cleanly.
--      c. Multi-touch model renamed from "linear" (1/N per touch) to
--         "w_shaped" (1.0 per touch = absolute credit points). First-touch
--         and last-touch models are unchanged.
--
--   3. mart.data_quality_flags — new materialized view surfacing Opportunities
--      where opportunity_create_date < sql_date ("opp_before_sql") and
--      Opportunities where a Contact has no SQL date ("opp_without_sql").
--      These records are not excluded from attribution; they are flagged so
--      the admin sync page can surface data quality issues.
--
-- All dependent materialized views are rebuilt via CASCADE on DROP.
-- ============================================================================

-- ============================================================================
-- 1. mart.touchpoints — status filter
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.touchpoints CASCADE;

CREATE MATERIALIZED VIEW mart.touchpoints AS
SELECT
    cm.contact_id,
    cm.campaign_id,
    MIN(COALESCE(cm.first_responded_date, cm.created_date::date)) AS touchpoint_at
FROM raw.sf_campaign_member cm
WHERE NOT cm.is_deleted
  AND cm.contact_id  IS NOT NULL
  AND cm.campaign_id IS NOT NULL
  -- Only active-engagement statuses count. Invited (no action), Email Opened
  -- (bot/false-positive risk), and Rejected/No Response (passive) are excluded.
  AND cm.status IN ('Registered', 'Attended', 'Responded')
GROUP BY cm.contact_id, cm.campaign_id;

CREATE UNIQUE INDEX touchpoints_pk       ON mart.touchpoints (contact_id, campaign_id);
CREATE INDEX        touchpoints_camp_idx  ON mart.touchpoints (campaign_id);
CREATE INDEX        touchpoints_at_idx    ON mart.touchpoints (touchpoint_at);

GRANT SELECT ON mart.touchpoints TO authenticated;

-- ============================================================================
-- 2. mart.attribution_contact — 12-month SQL-anchored window + w_shaped model
--
-- Dropping touchpoints above already cascaded this view. Re-create from scratch.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.attribution_contact CASCADE;

CREATE MATERIALIZED VIEW mart.attribution_contact AS
WITH stages AS (
    -- sql_date is propagated into every stage row so all four stages share
    -- the same 12-month window anchor (sql_date - 1 year).
    --
    -- MQL: falls back to mql_date when sql_date is null (contact never hit SQL).
    -- Opp + Customer: require sql_date (skipped if null — can't anchor window).
    SELECT
        contact_id, account_id, sql_date,
        'mql'::text  AS stage,
        mql_date     AS transition_date,
        COALESCE(sql_date, mql_date) - INTERVAL '1 year' AS window_start
    FROM mart.lifecycle_transitions
    WHERE mql_date IS NOT NULL
    UNION ALL
    SELECT
        contact_id, account_id, sql_date,
        'sql'::text  AS stage,
        sql_date     AS transition_date,
        sql_date - INTERVAL '1 year' AS window_start
    FROM mart.lifecycle_transitions
    WHERE sql_date IS NOT NULL
    UNION ALL
    SELECT
        contact_id, account_id, sql_date,
        'opp'::text  AS stage,
        opp_date     AS transition_date,
        sql_date - INTERVAL '1 year' AS window_start
    FROM mart.lifecycle_transitions
    WHERE opp_date IS NOT NULL AND sql_date IS NOT NULL
    UNION ALL
    SELECT
        contact_id, account_id, sql_date,
        'customer'::text AS stage,
        customer_date    AS transition_date,
        sql_date - INTERVAL '1 year' AS window_start
    FROM mart.lifecycle_transitions
    WHERE customer_date IS NOT NULL AND sql_date IS NOT NULL
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
    -- 12-month window anchored to sql_date, strictly before the transition (ATTR-06)
    WHERE tp.touchpoint_at <  s.transition_date
      AND tp.touchpoint_at >= s.window_start
),
-- W-shaped: every qualifying touch point receives 1 absolute credit point.
-- First-touch and last-touch are unchanged (1.0 to the single first/last touch).
-- Using absolute points (not 1/N fractions) lets you compare campaign credit
-- across contacts with different numbers of touch points.
w_shaped AS (
    SELECT
        contact_id, account_id, stage, transition_date, campaign_id,
        'w_shaped'::text   AS model,
        1.0::numeric(10,6) AS credit
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
SELECT * FROM w_shaped
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

GRANT SELECT ON mart.attribution_contact TO authenticated;

-- ============================================================================
-- 3. mart.attribution_account — rebuild (cascaded by attribution_contact drop)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.attribution_account CASCADE;

CREATE MATERIALIZED VIEW mart.attribution_account AS
SELECT
    account_id,
    stage,
    model,
    campaign_id,
    SUM(credit)                  AS credit,
    COUNT(DISTINCT contact_id)   AS contact_count
FROM mart.attribution_contact
WHERE account_id IS NOT NULL
GROUP BY account_id, stage, model, campaign_id;

CREATE UNIQUE INDEX attribution_account_pk
    ON mart.attribution_account (account_id, stage, model, campaign_id);
CREATE INDEX attribution_account_campaign_idx ON mart.attribution_account (campaign_id);
CREATE INDEX attribution_account_stage_idx    ON mart.attribution_account (stage);
CREATE INDEX attribution_account_model_idx    ON mart.attribution_account (model);

GRANT SELECT ON mart.attribution_account TO authenticated;

-- ============================================================================
-- 4. mart.opportunity_credit — rebuild (cascaded by attribution_contact drop)
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.opportunity_credit CASCADE;

CREATE MATERIALIZED VIEW mart.opportunity_credit AS
WITH won_opps AS (
    SELECT
        o.id           AS opportunity_id,
        o.account_id,
        o.close_date,
        o.amount::numeric AS amount
    FROM raw.sf_opportunity o
    WHERE NOT o.is_deleted
      AND o.is_won = true
      AND o.amount IS NOT NULL
),
distinct_ocr AS (
    SELECT DISTINCT
        wo.opportunity_id,
        wo.account_id,
        wo.close_date,
        wo.amount,
        ocr.contact_id
    FROM won_opps wo
    JOIN raw.sf_opportunity_contact_role ocr
      ON ocr.opportunity_id = wo.opportunity_id
     AND NOT ocr.is_deleted
     AND ocr.contact_id IS NOT NULL
),
ocr_split AS (
    SELECT
        opportunity_id,
        account_id,
        close_date,
        contact_id,
        amount / NULLIF(COUNT(*) OVER (PARTITION BY opportunity_id), 0) AS contact_share
    FROM distinct_ocr
)
SELECT
    os.opportunity_id,
    os.contact_id,
    os.account_id,
    os.close_date,
    a.campaign_id,
    a.model,
    (os.contact_share * a.credit)::numeric(18,4) AS revenue_credit
FROM ocr_split os
JOIN mart.attribution_contact a
  ON a.contact_id = os.contact_id
 AND a.stage = 'customer';

CREATE UNIQUE INDEX opp_credit_pk
    ON mart.opportunity_credit (opportunity_id, contact_id, campaign_id, model);
CREATE INDEX opp_credit_campaign_idx ON mart.opportunity_credit (campaign_id);
CREATE INDEX opp_credit_account_idx  ON mart.opportunity_credit (account_id);
CREATE INDEX opp_credit_model_idx    ON mart.opportunity_credit (model);
CREATE INDEX opp_credit_closed_idx   ON mart.opportunity_credit (close_date);

GRANT SELECT ON mart.opportunity_credit TO authenticated;

-- ============================================================================
-- 5. mart.data_quality_flags — Opportunity date inversions
--
-- Flags two cases:
--   "opp_before_sql"  — opportunity was created before the Contact reached SQL
--   "opp_without_sql" — opportunity exists but Contact has no SQL date at all
--
-- These records are NOT excluded from attribution — they're flagged for
-- review only. The admin /sync page surfaces this view.
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mart.data_quality_flags CASCADE;

CREATE MATERIALIZED VIEW mart.data_quality_flags AS
SELECT
    o.id                           AS opportunity_id,
    o.name                         AS opportunity_name,
    o.account_id                   AS opp_account_id,
    o.created_date::date           AS opportunity_date,
    c.id                           AS contact_id,
    lt.sql_date,
    CASE
        WHEN lt.sql_date IS NULL              THEN 'opp_without_sql'
        WHEN o.created_date::date < lt.sql_date THEN 'opp_before_sql'
    END                            AS flag_type
FROM raw.sf_opportunity o
JOIN raw.sf_opportunity_contact_role ocr
  ON ocr.opportunity_id = o.id
 AND NOT ocr.is_deleted
 AND ocr.contact_id IS NOT NULL
JOIN raw.sf_contact c
  ON c.id = ocr.contact_id
 AND NOT c.is_deleted
LEFT JOIN mart.lifecycle_transitions lt
  ON lt.contact_id = c.id
WHERE NOT o.is_deleted
  AND (lt.sql_date IS NULL OR o.created_date::date < lt.sql_date);

CREATE INDEX dq_flags_flag_type_idx      ON mart.data_quality_flags (flag_type);
CREATE INDEX dq_flags_opportunity_id_idx ON mart.data_quality_flags (opportunity_id);
CREATE INDEX dq_flags_contact_id_idx     ON mart.data_quality_flags (contact_id);

GRANT SELECT ON mart.data_quality_flags TO authenticated;

-- ============================================================================
-- 6. raw.sf_campaign — add BudgetedCost and ActualCost columns (idempotent)
-- ============================================================================

ALTER TABLE raw.sf_campaign
    ADD COLUMN IF NOT EXISTS budgeted_cost text,
    ADD COLUMN IF NOT EXISTS actual_cost   text;
