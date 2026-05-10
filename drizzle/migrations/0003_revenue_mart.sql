-- ============================================================================
-- Marketing BI — Phase 4B revenue mart
--
-- Creates mart.opportunity_credit: revenue credit per
--   (opportunity, contact, campaign, model)
--
-- Construction:
--   1. Take all Closed Won opportunities with non-null amount
--   2. ATTR-11 equal-split: each DISTINCT OpportunityContactRole Contact on
--      the Opp gets opp.amount / count(distinct OCR_contacts on this opp).
--      We dedupe at this step because a single Contact can hold multiple
--      OCR roles on the same Opp (e.g., Decision Maker + Influencer);
--      treating those as separate shares would over-credit.
--   3. Multiply by the Contact's customer-stage attribution credit (from
--      mart.attribution_contact). Customer stage is the right basis for
--      revenue because mart.lifecycle_transitions.customer_date is the
--      Contact's first Closed Won close_date.
--   4. The result is a fine-grained mart that downstream queries aggregate
--      (by campaign, by campaign type, by account, etc.).
--
-- Known divergences (documented in /methodology):
--   - A Contact with multiple Won Opps re-uses the SAME customer-stage
--     attribution touchpoint set for every Opp. Stricter implementations
--     would recompute attribution per-opp using each Opp's close_date.
--   - Opps with NULL amount are skipped (no revenue to attribute).
--   - Multiple OCR roles for the same Contact on the same Opp collapse
--     into one share (see step 2 above).
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
    -- One row per (opp, contact) pair, regardless of how many OCR roles
    -- the contact holds. Drops NULL contact_ids (orphan OCR rows).
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

-- Unique key + commonly-filtered indexes for CONCURRENTLY refresh + dashboard reads.
CREATE UNIQUE INDEX opp_credit_pk
    ON mart.opportunity_credit (opportunity_id, contact_id, campaign_id, model);
CREATE INDEX opp_credit_campaign_idx ON mart.opportunity_credit (campaign_id);
CREATE INDEX opp_credit_account_idx  ON mart.opportunity_credit (account_id);
CREATE INDEX opp_credit_model_idx    ON mart.opportunity_credit (model);
CREATE INDEX opp_credit_closed_idx   ON mart.opportunity_credit (close_date);

GRANT SELECT ON mart.opportunity_credit TO authenticated;
