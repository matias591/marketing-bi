-- ============================================================================
-- Drop Phase 1's premature unique constraint on raw.sf_campaign_member
-- (contact_id, campaign_id).
--
-- Salesforce allows multiple CampaignMember rows for the same Contact-Campaign
-- pair (a Contact can be re-added to a campaign over time; each row has a
-- unique Salesforce Id). ATTR-01 specifies deduping happens in
-- `mart.touchpoints` via MIN(touchpoint_at), not at the raw layer. The Phase 1
-- unique index would have blocked legit re-add events.
--
-- The live sync of 187,692 rows completed successfully because the current
-- production data happens to have no (contact, campaign) dupes — but future
-- syncs would have failed when the first dupe arrived.
-- ============================================================================

DROP INDEX IF EXISTS raw.sf_cm_contact_campaign_uniq;
