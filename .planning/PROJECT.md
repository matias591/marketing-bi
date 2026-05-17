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
- [ ] **Weekly full sync** of all 7 SF objects (Contact, Account, Campaign, Campaign Member, Opportunity, Opportunity Contact Role, Presentation__c) into Supabase; **daily delta sync** limited to Campaign Member Status changes and new campaign member additions (to capture same-day registrants from HubSpot automation)
- [ ] Read HubSpot-fed `Original Source` and `Latest Source` fields from Salesforce Contact records (no separate HubSpot connector)
- [ ] Capture Lifecycle Stage timestamps on Contact with defined sources: **MQL Date** = HubSpot MQL date field (synced into SF Contact); **SQL Date** = Presentation__c create date (when BDR/AE creates a Presentation); **Opportunity Date** = Salesforce Opportunity create date; **Customer Date** = Opportunity Closed Won date

**Attribution engine**
- [ ] First-touch attribution per Contact (read directly from existing `Original Source` field on Contact)
- [ ] Last-touch attribution per Contact (read directly from existing `Latest Source` field on Contact)
- [ ] Multi-touch (W-shaped) attribution: every campaign a Contact was a member of with status **Registered, Attended, or Responded** (not Invited, Email Opened, or Rejected) within a **12-month lookback window anchored to SQL create date** for each lifecycle stage (SQL / Opp / Customer); credit model: First Touch = 1 pt, Last Touch = 1 pt, each Middle Touch = 1 pt (total = N touch points); expressed as absolute credit points (not percentages) to enable fair cross-contact comparison
- [ ] Attribution lookback window: 12 months from SQL create date, applied consistently to SQL, Opportunity, and Customer stages; touch point must fall within the window and strictly before (`<`) the lifecycle transition date
- [ ] Touch point status filter: only Campaign Member statuses of **Registered**, **Attended**, or **Responded** qualify; **Invited**, **Email Opened**, and **Rejected/No Response** are explicitly excluded
- [ ] Data quality flag: surface Opportunities where `opportunity_create_date < sql_create_date`, or where an Opportunity exists but no SQL date is set; these are flagged as data quality issues, not excluded from sync
- [ ] Account-level rollup: aggregate Contact attribution to the Account, and surface "engaged contacts per account" metrics

**Dashboards (pre-built, pivot-style explorable)**
- [ ] **Funnel View** — MQL → SQL → Opportunity → Customer counts and stage conversion rates per period; date-range filterable
- [ ] **Campaign Attribution Table** — per campaign: # contacts, # SQLs, # Opportunities, # Customers, revenue attributed, attribution credits (First / Last / Middle); rollup by Campaign Type; filterable by date range and campaign type
- [ ] **Contact Journey** — full timeline of touch points per contact across lifecycle stages; common path patterns leading to SQL/Opp/Customer
- [ ] **Account-Level View** — most-engaged accounts, contacts-engaged-per-account, campaigns most influencing target accounts; drill-down to campaign member level
- [ ] **Revenue & Closed Won Attribution** — campaigns and campaign types influencing Closed Won; revenue attributed by campaign type
- [ ] **Touchpoint Depth Analysis** — average touchpoints to SQL and to Closed Won; touchpoint distribution for high-value vs low-value deals; fast vs slow conversion journeys
- All views: date range filtering, export to CSV/Excel, drill-down to campaign member level

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
- **Campaign structure: one campaign per event.** All lifecycle stages (invite, registration, attendance, follow-up) are managed via Campaign Member Statuses within a single campaign. Attribution-eligible statuses: `Registered`, `Attended`, `Responded`. Non-attribution statuses: `Invited`, `Rejected/No Response`, `Email Opened` (excluded due to bot/false-positive risk). HubSpot automation pushes form registrants into Salesforce campaigns as `Registered` automatically. Required campaign fields: Start Date (first outreach), End Date (event date), Budget/Actual Cost, Campaign Type. The dashboard reads this structure from Salesforce — it does not enforce or reshape campaign records.
- **Lifecycle date sources (confirmed):** MQL Date = HubSpot MQL date field (synced into SF Contact); SQL Date = Presentation__c create date; Opportunity Date = SF Opportunity create date (must be ≥ SQL Date — violations flagged as data quality issues); Customer Date = Opportunity Closed Won date.

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
| Multi-touch = W-shaped (First=1pt, Last=1pt, Middle=1pt each; total=N) | Business call 2026-05-17: W-shaped model with absolute credit points (not percentages) gives fair cross-contact comparison. First and Last touches are always worth 1 pt; middle touches each get 1 pt (same absolute value). Expressed positionally so the team can reason about first vs. last influence. Replaces original linear/even-split decision. | — Confirmed |
| Attribution lookback = 12 months from SQL date for all stages | Business call 2026-05-17: MQL→SQL can take time; SQL→Opp typically <1 month; SQL→Customer up to 6+ months. 12 months covers all cases cleanly. Window is always anchored to SQL create date, not each individual stage date. Replaces original 90-day window. | — Confirmed |
| Touch point filter = Registered/Attended/Responded only | Business call 2026-05-17: Invited (no action), Email Opened (bot risk), Rejected/No Response (passive) are not meaningful engagement signals. Only active engagement counts toward attribution. | — Confirmed |
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
*Last updated: 2026-05-17 after business call — attribution model, lookback window, touch point rules, campaign structure, sync cadence, lifecycle date sources, Funnel View dashboard*
