# Roadmap: Marketing BI

**Created:** 2026-05-10
**Mode:** mvp (vertical slicing — ship one end-to-end attribution view fast, layer the rest)
**Granularity:** standard
**Total phases:** 6
**Total v1 requirements:** 59 (all mapped — 0 orphans)

## Core Value

Marketing attribution that Salesforce reports can't answer cleanly — multi-touch credit (first / last / linear) for every Contact and Account across the MQL → SQL → Opp → Customer funnel, with the methodology and data freshness visible enough that the marketing team trusts the numbers.

## Build Order Rationale

Locked by research (Pitfalls 13, 15 — `.planning/research/PITFALLS.md`):

1. **Phase 1 deploys an auth-gated dashboard with stub/seed data** — explicit Pitfall 15 mitigation. Sync depth comes later.
2. **Phase 1 ships email/password auth FIRST** — Pitfall 13 mitigation (Google OAuth ticket can be a multi-day blocker).
3. **Phase 2 sets up the snapshot tables (DATA-09, DATA-10) on the first sync run** — non-recoverable if delayed (Pitfalls 6, 16).
4. **Phase 3 locks in attribution methodology** — 90-day window, per-stage independence, strictly-less-than transition boundary, touchpoint dedupe, OCR equal split. Methodology page (ATTR-12) ships in this phase.
5. **Dashboards build in order G1 → G4 → G2 → G3 → G5** (research feature priority).
6. **Phase 6 ships the launch surface** — Google SSO, Slack alerts, admin/sync, CSV export, mobile-as-KPI-cards, polish, failure-mode smoke test.

## Phases

- [ ] **Phase 1: Vertical Slice + Auth Foundation** — Deployed Vercel app, email/password gated, displays one chart from seeded fixture data
- [ ] **Phase 2: Production Sync Infrastructure** — Daily Vercel Cron pulls all 7 SF objects into `raw.*`, snapshots history, refreshes marts, alerts on failure
- [ ] **Phase 3: Attribution Engine** — `mart.touchpoints` + `mart.attribution_contact` + `mart.attribution_account` with locked-in methodology and signed-off methodology page
- [ ] **Phase 4: G1 + G4 Dashboards (Campaign + Revenue)** — Campaign Contribution to SQLs and Closed Won Revenue dashboards live with filters, model toggle, model comparison, excluded-record reasons
- [ ] **Phase 5: G2 + G3 Dashboards (Journey + Accounts)** — Contact Journey and Account-Level Attribution dashboards live with drill-down side panel
- [ ] **Phase 6: Launch Surface (G5 + Polish + SSO)** — Touchpoint Depth dashboard, Google SSO, Slack alerts, `/admin/sync`, CSV export, mobile KPI cards, failure-mode smoke test

## Phase Details

### Phase 1: Vertical Slice + Auth Foundation ✅ Done — 2026-05-10
**Goal:** Deployed Vercel app where an admin (`matias@orca-ai.io`) and invited users sign in with email/password, a weekly Vercel Cron pulls all 7 Salesforce objects into `raw.sf_*`, and `/dashboard/campaigns` renders a bar chart of "Campaign Contribution to SQLs" from real Salesforce data.
**Mode:** mvp
**Depends on:** Nothing (first phase)
**Requirements:** AUTH-01, AUTH-03, AUTH-04, AUTH-05, PLAT-12, **DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-08, DATA-09, DATA-10, DATA-11, DATA-13** (last 11 pulled forward from original P2 — see CONTEXT.md scope-shift note)
**Success Criteria** (what must be TRUE):
  1. A deployed Vercel URL exists; visiting any `/dashboard/*` route while signed-out redirects to `/login`. ✅
  2. A user with an allowlisted email domain (invite-only model — admin pre-creates in Supabase Studio) can sign in with email + password; the session persists across browser refresh via `@supabase/ssr` HTTP-only cookies. ✅
  3. A user with a non-allowlisted email domain is rejected at the database layer (Postgres trigger on `auth.users` insert raises an exception); rejection is not just frontend-checked. ✅
  4. A "Campaign Contribution to SQLs" page exists and renders a bar chart **from live Salesforce data via the weekly cron pipeline** (replaces the original "seed fixture" criterion — user chose live SF data during discuss-phase). ✅
  5. All API routes that touch the DB or Salesforce explicitly declare `runtime = 'nodejs'`; the build does not include any Edge-runtime DB or jsforce code. ✅
  6. Weekly Vercel Cron (`0 6 * * 0`) pulls all 7 SF objects (Contact, Account, Campaign, CampaignMember, Opportunity, OpportunityContactRole, Presentation__c) into `raw.sf_*` via OAuth 2.0 JWT Bearer Flow + `@jsforce/jsforce-node`. ✅
  7. `ops.contact_source_history` and `ops.campaigns_history` are populated on every cron run from the FIRST run (Pitfall 6 / 16); `ops.sync_runs` + `ops.sync_errors` record run lifecycle. ✅
**Plans:** Direct execution from CONTEXT.md (no PLAN.md — built inline alongside the user)
**UI hint**: yes

### Phase 2: Production Sync Polish (was: Production Sync Infrastructure)
**Goal:** Promote the weekly cron from Phase 1 to production-grade daily operation — daily cadence with object-staggered cron entries, full historical backfill before incremental kicks in, Slack alerts on failure, robust `INVALID_FIELD` strip-and-retry resilience, the `/admin/sync` operations view, and the cron-secret hardening guarantees. The sync infrastructure itself shipped in Phase 1; this phase makes it operationally bulletproof.
**Mode:** mvp
**Depends on:** Phase 1
**Requirements:** AUTH-06, DATA-07 (atomic mart refresh — couples to Phase 3 marts), DATA-12 (full INVALID_FIELD resilience), DATA-14 (Slack alerts — pulled in from original P6), DATA-15 (one-shot backfill), PLAT-11 (`/admin/sync` page — pulled in from original P6)
**Success Criteria** (what must be TRUE):
  1. Cron schedule: **weekly full sync** refreshes all 7 SF objects (staggered by object, Vercel Hobby plan compatible); a separate **daily delta sync** runs only for CampaignMember — capturing same-day status changes and new members added by HubSpot automation. All other objects remain weekly-only.
  2. A one-shot backfill script (run from a developer laptop, not from cron) loads the full historical dataset before the first daily-incremental run advances watermarks.
  3. `INVALID_FIELD` errors on one object don't abort the whole sync — affected field is logged to `ops.sync_errors` and the object resyncs without that field on the next run.
  4. After all extracts succeed, marts in `mart.*` (built in Phase 3) are refreshed via `REFRESH MATERIALIZED VIEW CONCURRENTLY` atomically per run; on extract failure, marts retain prior day's data.
  5. Sync failures post to a Slack incoming webhook (URL in env var); empty webhook = silent (logs only).
  6. `/admin/sync` page (admin-only) reads `ops.sync_runs` + `ops.sync_errors` and renders the last 30 days of run history.
  7. `AUTH-06`: cron route's `Authorization: Bearer ${CRON_SECRET}` check is exercised by an end-to-end test, not just the live curl invocation done in P1.
**Plans:** TBD
**Note:** This phase can run in parallel with or after Phase 3, since the daily-cron and mart-refresh pieces depend on the marts existing. Recommended ordering: P3 marts first → P2 daily promotion + mart refresh together.

### Phase 3: Attribution Engine
**Goal:** The marts that compute first-touch, last-touch, and W-shaped multi-touch attribution at Contact and Account level — with methodology locked in (**12-month lookback anchored to SQL date**, W-shaped credit model, status-filtered touch points, per-stage independent credit, strict `<` boundary, touchpoint dedupe, soft-delete filter, OCR equal split, data quality flag for Opp date inversions) and a methodology page that the marketing director has signed off before any dashboard ships.
**Mode:** mvp
**Depends on:** Phase 1 (sync infrastructure already running; Phase 2 daily-promotion can run in parallel or after this phase)
**Requirements:** ATTR-01, ATTR-02, ATTR-03, ATTR-04 (updated: 12-month window, not 90-day), ATTR-05, ATTR-06, ATTR-07, ATTR-08, ATTR-09, ATTR-10, ATTR-11, ATTR-12, ATTR-13, DATA-16 (data quality flags)
**Success Criteria** (what must be TRUE):
  1. `mart.touchpoints` materialized view contains one row per (Contact, Campaign) pair (deduped on `(contact_id, campaign_id)`); touchpoint timestamp is `COALESCE(first_responded_date, created_date)` of the earliest CampaignMember row; **only CampaignMember rows with status `Registered`, `Attended`, or `Responded` qualify — `Invited`, `Email Opened`, and `Rejected/No Response` are excluded**.
  2. `mart.attribution_contact` produces, for each Contact, per-stage independent attribution credit at MQL / SQL / Opp / Customer; first-touch and last-touch read from `ops.contact_source_history` value as-of the lifecycle transition date (not the current SF value); **W-shaped multi-touch credit: First Touch = 1 pt, Last Touch = 1 pt, each Middle Touch = 1 pt (total = N touch points); lookback window is 12 months anchored to SQL create date for all stages** (not per-stage date), applied strictly before each transition (`<`, not `<=`).
  3. `mart.attribution_account` is a `GROUP BY account_id` rollup of `mart.attribution_contact` joined through the `account_id` snapshot as-of the lifecycle event (not current Account); attribution queries filter `WHERE NOT contact.is_deleted`; Closed Won credit splits equally across all `OpportunityContactRole` Contacts.
  4. A "How attribution is computed" methodology page is reachable from every dashboard header and documents: model definitions, the 90-day window, per-stage independence, OCR equal-split, deletion-filter behavior, and known divergences from Salesforce native reports.
  5. Vitest unit tests assert that `mart.attribution_contact` (SQL) and `lib/attribution/wshape.ts` (TypeScript reference implementation) produce identical credit splits on a seeded fixture set; the marketing director has signed off the methodology page before any dashboard work begins.
  6. Data quality: `mart.data_quality_flags` surfaces (a) Opportunities where `opportunity_create_date < sql_create_date` and (b) Opportunities with no associated SQL date on the Contact; these records are included in all other marts but flagged — not silently excluded.
**Plans:** TBD

### Phase 4: G1 + G4 Dashboards (Campaign + Revenue)
**Goal:** The two highest-priority dashboards live — Campaign Contribution to SQLs (G1, "loudest user need") and Revenue & Closed Won (G4, "highest stakes") — with the global filter bar, date picker, model toggle, model-comparison view, and excluded-record reasons that every subsequent dashboard inherits.
**Mode:** mvp
**Depends on:** Phase 3
**Requirements:** DASH-01, DASH-02, DASH-03, DASH-04, DASH-12, DASH-13, DASH-14, PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06, PLAT-08
**Success Criteria** (what must be TRUE):
  1. **Funnel View** (`/dashboard/funnel`, DASH-14): renders MQL → SQL → Opportunity → Customer counts and stage-to-stage conversion rates for the selected date period, with date-range filtering. This is the default landing page.
  2. The **Campaign Attribution Table** (`/dashboard/campaigns`): renders a sortable top-N bar chart of SQLs per campaign, a **Campaign Type rollup view** (grouped/stacked, covering webinar / invite / email / etc.), per-campaign attribution credits (First / Last / Middle), and an Engagement → SQL conversion-rate sortable table — within the 3–4 primary charts cap.
  3. The Revenue & Closed Won page (`/dashboard/revenue`) renders Closed Won revenue by campaign and campaign type, showing both `$` value and `%` of total, with the attribution model toggle applied.
  3. A global date-range picker (presets: Last 7/30/90 days, This/Last Month, This/Last Quarter, YTD, Custom), a global filter bar (campaign type, lifecycle stage, account segment, owner), and an attribution-model toggle (First / Last / Linear) all affect every chart on each page; all filter / model / date state lives in URL `searchParams` (zod-parsed) so refresh and copy-link preserve the exact view.
  4. A side-by-side attribution-model comparison view shows the same metric under First / Last / Linear simultaneously on G1 and G4; every chart exposes a small "N records excluded ▸" affordance listing why (deleted, no campaign membership, etc.).
  5. A freshness indicator in each dashboard header reads `MAX(synced_at)` from data (not the cron schedule), color-coded green (<24h) / yellow (24–48h) / red (>48h); date filters convert via `AT TIME ZONE` using a project-wide business timezone (default `America/New_York`, configurable via env), with the active TZ visible near the date picker.
**Plans:** TBD
**UI hint**: yes

### Phase 5: G2 + G3 Dashboards (Journey + Accounts)
**Goal:** The Contact Journey dashboard (G2 — drill-down target from every other page) and the Account-Level Attribution dashboard (G3 — ABM use case) live, with the drill-down side panel that connects all dashboards into a single explorable surface.
**Mode:** mvp
**Depends on:** Phase 4
**Requirements:** DASH-05, DASH-06, DASH-07, DASH-08, DASH-10, PLAT-09, PLAT-10
**Success Criteria** (what must be TRUE):
  1. The Contact Journey page (`/dashboard/journey`) renders, for a selected Contact, a vertical timeline of campaign touchpoints with lifecycle-stage milestones overlaid; common-journey aggregation appears as a top-sequences table of the most frequent ordered campaign-type tuples leading to SQL (Sankey deferred to v1.x).
  2. The Account-Level Attribution page (`/dashboard/accounts`) renders a sortable account leaderboard table with columns Account, # engaged contacts, # SQLs, Closed Won revenue, last-touch date; a separate campaigns-influencing-target-accounts view shows campaign → unique-account count as a bar chart.
  3. Each dashboard supports drill-down: campaign card → list of influenced Contacts → individual Contact's full journey (G2 page); the drill UI is a side panel — not a modal, not a full-page navigation — and works from G1, G3, and G4.
  4. Page-level skeleton loaders show during initial query; per-chart skeleton loaders show during filter changes; partial data is never visible mid-load.
  5. Sequence-style displays cap displayed paths to top-N (default N=10) with remaining paths bucketed as "Other (N campaigns)"; the numerical table is the primary view, the diagram is the secondary garnish.
**Plans:** TBD
**UI hint**: yes

### Phase 6: Launch Surface (G5 + Polish + SSO)
**Goal:** The launch-ready surface — final dashboard (G5: Touchpoint Depth Analysis), Google SSO, Slack alerts on sync failure, `/admin/sync` operational view, CSV export per chart, mobile KPI fallback, Tableau-density polish, and the failure-mode smoke test that confirms idempotent recovery.
**Mode:** mvp
**Depends on:** Phase 5
**Requirements:** AUTH-02, DATA-14, DASH-09, DASH-11, PLAT-07, PLAT-11
**Success Criteria** (what must be TRUE):
  1. The Touchpoint Depth Analysis page (`/dashboard/depth`) renders a histogram of touchpoint counts to SQL and to Closed Won, with median and mean callouts.
  2. A user with an allowlisted Google Workspace email can sign in via Google SSO (`hd=` workspace hint passed at OAuth start, server-side domain trigger still enforced as defense-in-depth); email + password remains available as a fallback.
  3. Every dashboard chart exposes a CSV export button that returns server-side rendered CSV via a Route Handler (not client-side conversion); the `/admin/sync` page reads `ops.sync_runs` and renders the last 30 days of run history (start time, status, row counts, error if any).
  4. On mobile (≤768px), charts that don't reflow gracefully are replaced by KPI cards with a "View on desktop for full chart" link — no horizontally-scrolling dashboards exist; tested on real iPhone 390×844 and Android 360×800.
  5. A sync failure (forced by revoking the SF token in dev) posts to the configured Slack incoming webhook within one cron cycle; an empty webhook env var = silent (logs only); a failure-mode smoke test confirms killing the cron mid-run and re-running does not double-insert or skip rows (idempotency verified).
**Plans:** TBD
**UI hint**: yes

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Vertical Slice + Auth Foundation | n/a (direct exec) | ✅ Done | 2026-05-10 |
| 2. Production Sync Polish | 0/? | Not started (deferred — see Phase 3 dependency note) | — |
| 3. Attribution Engine | 0/? | Not started — **next up** | — |
| 4. G1 + G4 Dashboards (Campaign + Revenue) | 0/? | Not started | — |
| 5. G2 + G3 Dashboards (Journey + Accounts) | 0/? | Not started | — |
| 6. Launch Surface (G5 + Polish + SSO) | 0/? | Not started | — |

## Coverage Summary

| Category | Total | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|----------|-------|---------|---------|---------|---------|---------|---------|
| AUTH | 6 | 4 | 1 | — | — | — | 1 |
| DATA | 16 | — | 14 | 1 (DATA-16) | — | — | 1 |
| ATTR | 13 | — | — | 13 | — | — | — |
| DASH | 14 | — | — | — | 7 (incl. DASH-14) | 5 | 2 |
| PLAT | 12 | 1 | — | — | 7 | 2 | 2 |
| **Total** | **61** | **5** | **15** | **14** | **14** | **7** | **6** |

**Mapped:** 61 / 61 ✓ (added DASH-14 Funnel View, DATA-16 Data Quality Flags — 2026-05-17 business call)
**Orphans:** 0
**Duplicates:** 0

## Pitfall Coverage Verification

| Pitfall | Where addressed |
|---------|-----------------|
| 1 — Trigger-cascade timeout | P2 (Bulk API 2.0 from day 1, watermark per object) |
| 2 — Cron timing drift | P4 (`PLAT-05` freshness from `MAX(synced_at)`) |
| 3 — Hobby once-per-day cron | P2 (one-per-day-per-object staggered by hour) |
| 4 — Supavisor + prepared statements | P1 (connection pattern documented) + P4/P5 (5-concurrent smoke test) |
| 5 — Edge runtime breaks `pg` | P1 (`PLAT-12` runtime nodejs everywhere) |
| 6 — `Original Source` rewrites | P2 (`DATA-09` snapshot history on first sync) |
| 7 — Unbounded multi-touch | P3 (`ATTR-04` 12-month window anchored to SQL date — updated 2026-05-17 from 90-day) |
| 8 — SF report reconciliation | P3 (`ATTR-12` methodology page signed off before dashboards) |
| 9 — Supabase free-tier pause | P2 (`DATA-13` keep-alive) |
| 10 — Custom-field drift | P2 (`DATA-12` `INVALID_FIELD` resilience) |
| 11 — CampaignMember duplication | P3 (`ATTR-01` dedupe on `(contact_id, campaign_id)`) |
| 12 — Soft-deletes / merges | P2 (`DATA-04` `queryAll`) + P3 (`ATTR-10` filter is_deleted) |
| 13 — Google OAuth blocked | P1 ships email/password first; P6 ships Google SSO |
| 14 — Chart-builder scope creep | P4/P5 (fixed pivot dimensions per dashboard) |
| 15 — Sync-first death march | P1 ships dashboard from seed data BEFORE sync work |
| 16 — Picklist value renames | P2 (`DATA-10` `campaigns_history`) |
| 17 — Timezone confusion | P4 (`PLAT-06` `AT TIME ZONE`) |
| 18 — Off-by-one on transition boundary | P3 (`ATTR-06` strict `<`) |
| 19 — Lifecycle stage double-counting | P3 (`ATTR-07` per-stage independent) |
| 20 — Account reassignment | P3 (`ATTR-09` `account_id` as-of) |
| 21 — Multi-OCR Opp credit | P3 (`ATTR-11` equal split) |
| 22 — RLS aggregation perf | P3 (marts; RLS permissive for authenticated) |
| 23 — Cold-start latency | P6 (accepted; documented) |
| 24 — Partial chart load | P5 (`PLAT-09` skeleton loaders) |
| 25 — Filter state not in URL | P4 (`PLAT-04` URL searchParams) |
| 26 — Too many charts per page | P4 (`PLAT-08` 3–4 cap) |
| 27 — Sankey unreadable | P5 (`PLAT-10` top-N) |
| 28 — Mobile broken | P6 (`PLAT-07` KPI cards) |
| 29 — Premature dbt | Stack research locked: no dbt for v1 |
| 30 — Premature observability | P6 (Vercel logs + Slack only) |

---
*Roadmap generated: 2026-05-10*
*Mode: mvp (vertical slicing)*
