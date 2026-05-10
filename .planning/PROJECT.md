# Marketing BI

## What This Is

A Tableau-shaped, internal-only marketing BI dashboard for a single marketing team (4–10 users) that answers attribution and funnel questions off Salesforce data. The product surfaces pre-built dashboards with pivot-style exploration on top — users view and slice, they don't author new visualizations. Hosted on Vercel (frontend + cron), data in Supabase (Postgres + auth), data sourced exclusively from Salesforce.

## Core Value

**Marketing attribution that Salesforce reports can't answer cleanly:** for every Contact, see the full sequence of campaign touchpoints leading up to lifecycle transitions (MQL → SQL → Opportunity → Customer), then aggregate that into first-touch, last-touch, and multi-touch (linear) credit at both Contact and Account level — including which campaigns/types drove SQLs and Closed Won revenue, and how many touchpoints conversions actually require.

## Requirements

### Validated

(None yet — ship to validate)

### Active

**Data ingestion (Salesforce → Supabase)**
- [ ] Daily Salesforce sync of Contact, Account, Campaign, Campaign Member, Opportunity, Opportunity Contact Role, and the custom `Presentation` object into Supabase
- [ ] Read HubSpot-fed `Original Source` and `Latest Source` fields from Salesforce Contact records (no separate HubSpot connector)
- [ ] Capture Lifecycle Stage timestamps on Contact (MQL Date, SQL Date, Opportunity Date, Customer Date) so funnel transitions can be queried

**Attribution engine**
- [ ] First-touch attribution per Contact (read directly from existing `Original Source` field on Contact)
- [ ] Last-touch attribution per Contact (read directly from existing `Latest Source` field on Contact)
- [ ] Multi-touch (linear) attribution: every campaign a Contact was a member of between Contact creation and each lifecycle milestone (SQL / Opp / Customer), with even credit split
- [ ] Account-level rollup: aggregate Contact attribution to the Account, and surface "engaged contacts per account" metrics

**Dashboards (pre-built, pivot-style explorable)**
- [ ] **Campaign Contribution to SQLs** — SQLs by campaign and by campaign type, with engagement → SQL conversion efficiency
- [ ] **Contact Journey** — for a selected cohort, the typical sequence of campaign touchpoints before SQL/Opp/Customer; common patterns across successful journeys
- [ ] **Account-Level Attribution** — most-engaged accounts, contacts-engaged-per-account, campaigns most influencing target accounts
- [ ] **Revenue & Closed Won Attribution** — campaigns and campaign types influencing Closed Won; revenue attributed by campaign type
- [ ] **Touchpoint Depth Analysis** — average touchpoints to SQL and to Closed Won; touchpoint distribution for high-value vs low-value deals; fast vs slow conversion journeys

**Auth & access**
- [ ] Google SSO via Supabase Auth (workspace email allowlist), with email + password as fallback if Google OAuth setup is blocked
- [ ] Single-org access (no per-user role management beyond "team member can sign in")

**Platform**
- [ ] Tableau-like dense, professional visual aesthetic (data-rich screens, muted palette, business-tool feel)
- [ ] Desktop-primary, mobile-readable (responsive — pages don't break on a phone, but they're not designed for phone-first workflows)

### Out of Scope

- **Self-service chart builder** — Users only view and pivot-explore pre-built dashboards. Authoring new visualizations from scratch (Tableau Desktop-style drag-and-drop) is explicitly excluded; that scope is what makes Tableau expensive in the first place.
- **Multi-tenant / customer-facing SaaS** — Single internal org only. No org isolation, billing, signup flows, etc.
- **Non-Salesforce data sources** — No direct connectors to GA, ad platforms, HubSpot, or product DBs. HubSpot's first/last-touch values are already mirrored into Salesforce Contact fields.
- **Sub-daily data freshness** — Daily refresh is sufficient; hourly/real-time adds complexity without product justification at this scale.
- **AI / "ask your data in English" features** — Out of scope for v1. Deterministic dashboards only.
- **Custom Salesforce data-model setup** — The required SF configuration (Customizable Campaign Influence, Opportunity Contact Roles, Lifecycle Stage timestamps, Contact-only model) is already in place. The project consumes that model; it doesn't build it.

## Context

**The Salesforce data model is fixed and already configured:**
- **Contact-only model** — no Lead conversion. All inbound/outbound records are created as Contacts. Every Contact is associated to an Account.
- **Lifecycle Stage** lives on the Contact and is the funnel source of truth: MQL → SQL → Opp → Customer.
- **SQL trigger:** When a BDR/AE creates a `Presentation` (custom object) record, the Contact's Lifecycle Stage automatically flips to SQL.
- **Campaign Members are always tied to Contacts** — they are the touchpoint stream. No Lead Campaign Members exist.
- **Opportunity Contact Roles are mandatory** — every Opportunity has at least one, ideally multiple.
- **Customizable Campaign Influence** is enabled in Salesforce.
- **HubSpot's `Original Source` and `Latest Source`** are synced into custom fields on the Contact and serve as the canonical first/last-touch values.

**Identity is already solved.** Salesforce stitches Campaign Members to Contacts to Accounts. The dashboard layer trusts Salesforce's matching — no separate identity resolution needed.

**Data volume is small** — ~5K Accounts and ~15K Contacts. Campaign Member rows likely scale into the low hundreds of thousands. This fits comfortably inside Supabase's free tier (500MB database) and a Vercel hobby cron is sufficient for the daily sync window.

**Cost is the primary motivator.** Tableau's seat-based pricing for a 4–10 person marketing team is the pain point. The build target is "good enough for these specific attribution questions" rather than "general-purpose BI."

## Constraints

- **Tech stack — Frontend/host:** Vercel — chosen for free hobby tier; serverless functions for API routes; Vercel Cron for the daily Salesforce sync.
- **Tech stack — Backend/data:** Supabase — Postgres for the data warehouse, Supabase Auth for SSO, Supabase row-level security where useful. Free tier targeted; user is willing to upgrade Supabase before Vercel if forced to choose.
- **Tech stack — Data source:** Salesforce REST/Bulk API only. No other ingestion sources for v1.
- **Timeline:** Working v1 in 2–4 weeks. Implies a vertical-MVP slicing approach — ship one end-to-end attribution view fast, layer the rest on top.
- **Team size:** 4–10 internal users. No need to engineer for high concurrency or per-user customization.
- **Data freshness:** Daily refresh is sufficient. No real-time requirement.
- **Platform:** Desktop-primary; pages must be mobile-readable but not mobile-optimized.
- **Budget:** Free tiers preferred end-to-end. Paid tier (Supabase first if needed) acceptable if data volume or function-execution limits force it.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Build on Vercel + Supabase free tiers | Cost is the primary driver vs. Tableau; data volume (5K accounts / 15K contacts) fits comfortably in free tier. | — Pending |
| Salesforce-only ingestion for v1 | All required attribution data already lives in Salesforce (Campaign Members, Lifecycle Stage, Presentation custom object, HubSpot-fed source fields). Avoids the largest hidden cost in BI projects. | — Pending |
| Trust Salesforce's identity stitching | Contact-only model + mandatory OCR + Customizable Campaign Influence already in SF. Re-implementing identity resolution would duplicate work. | — Pending |
| Pre-built dashboards + pivot exploration only (no chart builder) | The cost of "Tableau-like" comes from the authoring experience, which the team doesn't need. Scope reduction makes 2–4 week timeline viable. | — Pending |
| Multi-touch = linear (even split) for v1 | Spec calls out first / last / multi-touch. Linear is the simplest fair multi-touch model and avoids debates about position-based weights. Other models can be added later. | — Pending |
| Vercel Cron for daily Salesforce sync | At 15K contacts daily-incremental, a single cron invocation fits inside Vercel's serverless time limits. Avoids adding a separate worker service. | — Pending |
| Google SSO via Supabase, email/password fallback | Team is on Google Workspace; Supabase's Google OAuth is free. Fallback path keeps auth from blocking timeline if OAuth setup snags. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-10 after initialization*
