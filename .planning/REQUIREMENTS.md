# Requirements: Marketing BI

**Defined:** 2026-05-10
**Core Value:** Marketing attribution that Salesforce reports can't answer cleanly — multi-touch credit (first / last / linear) for every Contact and Account across the MQL → SQL → Opp → Customer funnel, with the methodology and data freshness visible enough that the marketing team trusts the numbers.

## v1 Requirements

### Authentication & Access (AUTH)

- [ ] **AUTH-01**: User can sign in with email and password (Supabase Auth, primary in v1 to unblock the build)
- [ ] **AUTH-02**: User can sign in with Google SSO (Supabase + Google OAuth, `hd=` workspace hint)
- [ ] **AUTH-03**: Server-side email-domain allowlist enforced via Postgres trigger on `auth.users` insert (rejects non-allowlisted domains; not just frontend-checked)
- [ ] **AUTH-04**: Unauthenticated users hitting any dashboard route are redirected to login
- [ ] **AUTH-05**: Session persists across browser refresh via Supabase HTTP-only cookies (`@supabase/ssr`)
- [ ] **AUTH-06**: Cron sync routes verify `Authorization: Bearer $CRON_SECRET` and reject unauthenticated requests

### Data Ingestion (DATA)

- [ ] **DATA-01**: Daily Salesforce sync runs via Vercel Cron (Hobby plan, one-per-day per object)
- [ ] **DATA-02**: Sync covers `Contact`, `Account`, `Campaign`, `CampaignMember`, `Opportunity`, `OpportunityContactRole`, and `Presentation__c` (custom)
- [ ] **DATA-03**: Sync uses Salesforce Bulk API 2.0 for `CampaignMember` and any other object exceeding ~5K row delta; REST `query` for tiny objects
- [ ] **DATA-04**: Sync uses `queryAll` (not `query`) for Contact / Account / CampaignMember so soft-deleted (`IsDeleted=true`) rows are mirrored, not silently dropped
- [ ] **DATA-05**: Per-object watermarks (max `LastModifiedDate` from prior run) drive incremental extraction; watermarks advance only on successful load
- [ ] **DATA-06**: Sync writes into `raw.sf_*` Postgres tables 1:1 with Salesforce schema (no transformation during ingest); upserts are idempotent on Salesforce Id
- [ ] **DATA-07**: After all extracts succeed, materialized views in `mart.*` are refreshed via `REFRESH MATERIALIZED VIEW CONCURRENTLY`; on any extract failure, marts retain prior day's data
- [ ] **DATA-08**: Read HubSpot-fed `Original Source` and `Latest Source` directly from Salesforce Contact custom fields (no separate HubSpot connector)
- [ ] **DATA-09**: Snapshot `Original Source` and `Latest Source` per Contact into `ops.contact_source_history` on every sync — enables historically-stable first/last-touch even when HubSpot rewrites the live values
- [ ] **DATA-10**: Snapshot Campaign picklist values (e.g., `Type`, `Status`) into `ops.campaigns_history` so historical reports survive picklist renames
- [ ] **DATA-11**: Sync run lifecycle (`started_at`, `finished_at`, `status`, `row_counts`, `error`) recorded to `ops.sync_runs`; per-object errors recorded to `ops.sync_errors`
- [ ] **DATA-12**: A `INVALID_FIELD` error from Salesforce on one object does not abort the entire sync — affected field is logged and the object resyncs without that field
- [ ] **DATA-13**: A "keep-alive" DB query runs at the start of every cron invocation so the Supabase free tier doesn't auto-pause during low-activity periods
- [ ] **DATA-14**: Sync failure posts to a Slack incoming webhook (URL in env var); empty webhook = silent (logs only)
- [ ] **DATA-15**: A one-shot backfill script (run from a developer laptop, not from cron) loads the full historical dataset before the first cron-driven incremental run

### Attribution Engine (ATTR)

- [ ] **ATTR-01**: `mart.touchpoints` materialized view contains one row per (Contact, Campaign) pair — deduped on `(contact_id, campaign_id)`; touchpoint timestamp is `COALESCE(first_responded_date, created_date)` of the earliest CampaignMember row
- [ ] **ATTR-02**: First-touch attribution per Contact reads from the historically-stable `ops.contact_source_history` value as-of the lifecycle transition date (NOT the current Salesforce value)
- [ ] **ATTR-03**: Last-touch attribution per Contact reads from `ops.contact_source_history` value as-of the lifecycle transition date
- [ ] **ATTR-04**: Multi-touch (linear) attribution credits every campaign in the Contact's touchpoint stream within a **90-day window before the lifecycle transition**, with even credit (`1/N`)
- [ ] **ATTR-05**: Touchpoint stream includes ALL CampaignMember rows (any status, including `Sent`); the engine does not filter to "Responded" only
- [ ] **ATTR-06**: Touchpoint timestamps strictly less than (`<`) the lifecycle transition date are credited; same-day post-transition touches are excluded
- [ ] **ATTR-07**: Lifecycle stages are independent attribution events: a Contact who reaches MQL, SQL, Opp, and Customer accrues attribution credit at all four milestones (per-stage credit, not single-bucket)
- [ ] **ATTR-08**: Account-level attribution is a `GROUP BY account_id` rollup of `mart.attribution_contact` joined through `stage.contact.account_id`; no parallel Account-touchpoint pipeline
- [ ] **ATTR-09**: Account-level rollups use the `account_id` as-of the lifecycle event (snapshot column), not the current Account, when a Contact has been reassigned across Accounts
- [ ] **ATTR-10**: Attribution queries filter `WHERE NOT contact.is_deleted` so soft-deleted Contacts don't double-count; soft-deleted rows remain in `raw.*` as historical truth
- [ ] **ATTR-11**: Closed Won revenue attribution splits credit equally across all `OpportunityContactRole` Contacts on the Opportunity (Role-weighting deferred to v2)
- [ ] **ATTR-12**: A "How attribution is computed" methodology page is reachable from every dashboard header, documenting: model definitions, the 90-day window, per-stage independence, OCR equal-split, deletion-filter behavior, and known divergences from Salesforce native reports
- [ ] **ATTR-13**: Vitest unit tests assert that the SQL `mart.attribution_contact` and a TypeScript reference implementation (`lib/attribution/linear.ts`) produce identical credit splits on seeded fixtures

### Dashboards (DASH)

**Dashboard build order:** G1 → G4 → G2 → G3 → G5

- [ ] **DASH-01** *(G1, ships first)*: Campaign Contribution to SQLs page — sortable bar chart of SQLs per campaign with top-N truncation
- [ ] **DASH-02** *(G1)*: Campaign-type rollup view (grouped/stacked bars) on the same page
- [ ] **DASH-03** *(G1)*: Engagement → SQL conversion-rate sortable table with rate column per campaign
- [ ] **DASH-04** *(G4)*: Revenue & Closed Won page — Closed-Won revenue by campaign and by campaign type with the attribution model toggle applied; shows $ value and % of total
- [ ] **DASH-05** *(G2)*: Contact Journey page — for a selected Contact, vertical timeline of campaign touchpoints with lifecycle stage milestones overlaid (drill-down target from every other dashboard)
- [ ] **DASH-06** *(G2)*: Common-journey aggregation as a top-sequences table — most frequent ordered campaign-type tuples leading to SQL (Sankey deferred to v1.x)
- [ ] **DASH-07** *(G3)*: Account-Level Attribution page — sortable account leaderboard table (Account, # engaged contacts, # SQLs, Closed Won revenue, last-touch date)
- [ ] **DASH-08** *(G3)*: Campaigns-influencing-target-accounts view — bar chart of campaign → unique-account count
- [ ] **DASH-09** *(G5)*: Touchpoint Depth Analysis page — histogram of touchpoint counts to SQL and to Closed Won, with median/mean callouts
- [ ] **DASH-10**: Each dashboard supports drill-down: campaign card → list of influenced Contacts → individual Contact's full journey (DASH-05). Drill UI is a side panel, not modal or full navigation
- [ ] **DASH-11**: Each dashboard exposes a CSV export button per chart (server-side rendered CSV via Route Handler, not client-side conversion)
- [ ] **DASH-12** *(differentiator pulled into v1)*: Side-by-side attribution-model comparison — same metric viewed under First / Last / Linear simultaneously on the relevant dashboards (G1, G3, G4)
- [ ] **DASH-13** *(differentiator pulled into v1)*: Excluded-record reasons surfaced per chart — small "N records excluded ▸" affordance lists why (deleted, no campaign membership, etc.)

### Platform & UX (PLAT)

- [ ] **PLAT-01**: Global date-range picker affects every chart on the active dashboard (presets: Last 7/30/90 days, This/Last Month, This/Last Quarter, YTD, Custom)
- [ ] **PLAT-02**: Global filter bar (campaign type, lifecycle stage, account segment if available, owner) applies to all charts on the page; pivot dimensions are fixed per dashboard, not user-configurable
- [ ] **PLAT-03**: Attribution model toggle (First / Last / Linear) on every dashboard where attribution credit is shown
- [ ] **PLAT-04**: All filter, model, and date state lives in URL `searchParams` (zod-parsed); refreshing the page or copying the URL preserves the exact view
- [ ] **PLAT-05**: Freshness indicator in the header of every dashboard reads `MAX(synced_at)` from data (NOT the cron schedule); color-coded green (<24h), yellow (24–48h), red (>48h)
- [ ] **PLAT-06**: All date filters convert via `AT TIME ZONE` using a project-wide business timezone constant (default `America/New_York`, configurable via env); UI displays the active TZ near the date picker
- [ ] **PLAT-07**: Pages are designed for desktop; on mobile (≤768px) charts that don't reflow gracefully are replaced by KPI cards with a "View on desktop for full chart" link — no horizontally-scrolling dashboards
- [ ] **PLAT-08**: Each dashboard caps at 3–4 primary charts per page; secondary charts are tabbed or collapsed by default; queries are batched server-side
- [ ] **PLAT-09**: Page-level skeleton loader during initial query; per-chart skeleton during filter changes — partial data is never visible mid-load
- [ ] **PLAT-10**: Sankey/journey-style diagrams cap displayed paths to top-N (default N=10); remaining paths bucket as "Other (N campaigns)"; numerical table is the primary view, diagram is the secondary garnish
- [ ] **PLAT-11**: A `/admin/sync` page reads `ops.sync_runs` and renders the last 30 days of run history (start time, status, row counts, error if any)
- [ ] **PLAT-12**: All API routes that touch the database or Salesforce explicitly declare `runtime = 'nodejs'` (no Edge runtime for DB/SF code)

## v2 Requirements

Backlog — acknowledged but not in current roadmap.

### Differentiators
- **DIFF-01**: Shareable URL with explicit "Copy view link" button (filter state already in URL via PLAT-04; this is the marketing/affordance layer)
- **DIFF-02**: Saved named views ("My Q1 webinar funnel")
- **DIFF-03**: Period-over-period comparison ("this quarter vs last quarter")
- **DIFF-04**: Common-journey Sankey diagram (paired with the v1 top-sequences table)
- **DIFF-05**: Per-chart custom filters that override the global filter bar

### Attribution
- **ATTR-V2-01**: Position-based (40/20/40) attribution model
- **ATTR-V2-02**: Time-decay attribution model
- **ATTR-V2-03**: OCR Role weighting on Closed Won credit (Decision Maker > Influencer)
- **ATTR-V2-04**: Configurable multi-touch window per dashboard

### Platform
- **PLAT-V2-01**: PDF report export
- **PLAT-V2-02**: Per-user roles (some users see Closed Won revenue, others don't)
- **PLAT-V2-03**: Snapshot tables for historical lifecycle state (handles stage reverts and "as of last quarter" queries)
- **PLAT-V2-04**: Full-text search on Contact and Account names

## Out of Scope

| Feature | Reason |
|---------|--------|
| Self-service chart builder | The entire reason this isn't just Tableau — authoring is the cost driver. Pivot exploration uses fixed dimensions per dashboard. |
| Multi-tenant / customer-facing SaaS | Single internal org only. No org isolation, billing, signup flows. |
| Non-Salesforce data sources (HubSpot direct, GA, ad platforms, product DB) | All needed attribution data already lives in Salesforce. HubSpot's first/last-touch values are mirrored into Contact custom fields. |
| Sub-daily / hourly / real-time data refresh | Daily is sufficient for the use case; sub-daily adds platform complexity (Vercel Pro, parallelized syncs) without product justification. |
| AI / "ask your data in English" features | Out of scope for v1. Deterministic dashboards only. |
| Custom Salesforce data-model setup (enabling Customizable Campaign Influence, OCR mandates, Lifecycle Stage timestamps, Contact-only model) | Already configured in Salesforce by the user. The project consumes the model; it doesn't build it. |
| Salesforce write-back (commenting on campaigns, updating Contact attributes) | Read-only consumer of Salesforce. |
| dbt or other data-stack tooling | Plain SQL migrations + Postgres materialized views are sufficient at this scale. |
| Background queue / worker service (Inngest, Trigger.dev, pg_boss) | Vercel Cron + serverless functions handle the volume. |
| Alerting / scheduled email digests / threshold notifications | Slack webhook for sync failures only. |
| Public sharing / embed-anywhere widgets | Internal tool. |

## Traceability

Populated by roadmapper on 2026-05-10. Status updates as phases execute.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 6 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 2 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| DATA-03 | Phase 2 | Pending |
| DATA-04 | Phase 2 | Pending |
| DATA-05 | Phase 2 | Pending |
| DATA-06 | Phase 2 | Pending |
| DATA-07 | Phase 2 | Pending |
| DATA-08 | Phase 2 | Pending |
| DATA-09 | Phase 2 | Pending |
| DATA-10 | Phase 2 | Pending |
| DATA-11 | Phase 2 | Pending |
| DATA-12 | Phase 2 | Pending |
| DATA-13 | Phase 2 | Pending |
| DATA-14 | Phase 6 | Pending |
| DATA-15 | Phase 2 | Pending |
| ATTR-01 | Phase 3 | Pending |
| ATTR-02 | Phase 3 | Pending |
| ATTR-03 | Phase 3 | Pending |
| ATTR-04 | Phase 3 | Pending |
| ATTR-05 | Phase 3 | Pending |
| ATTR-06 | Phase 3 | Pending |
| ATTR-07 | Phase 3 | Pending |
| ATTR-08 | Phase 3 | Pending |
| ATTR-09 | Phase 3 | Pending |
| ATTR-10 | Phase 3 | Pending |
| ATTR-11 | Phase 3 | Pending |
| ATTR-12 | Phase 3 | Pending |
| ATTR-13 | Phase 3 | Pending |
| DASH-01 | Phase 4 | Pending |
| DASH-02 | Phase 4 | Pending |
| DASH-03 | Phase 4 | Pending |
| DASH-04 | Phase 4 | Pending |
| DASH-05 | Phase 5 | Pending |
| DASH-06 | Phase 5 | Pending |
| DASH-07 | Phase 5 | Pending |
| DASH-08 | Phase 5 | Pending |
| DASH-09 | Phase 6 | Pending |
| DASH-10 | Phase 5 | Pending |
| DASH-11 | Phase 6 | Pending |
| DASH-12 | Phase 4 | Pending |
| DASH-13 | Phase 4 | Pending |
| PLAT-01 | Phase 4 | Pending |
| PLAT-02 | Phase 4 | Pending |
| PLAT-03 | Phase 4 | Pending |
| PLAT-04 | Phase 4 | Pending |
| PLAT-05 | Phase 4 | Pending |
| PLAT-06 | Phase 4 | Pending |
| PLAT-07 | Phase 6 | Pending |
| PLAT-08 | Phase 4 | Pending |
| PLAT-09 | Phase 5 | Pending |
| PLAT-10 | Phase 5 | Pending |
| PLAT-11 | Phase 6 | Pending |
| PLAT-12 | Phase 1 | Pending |

**Coverage (set after roadmap creation):**
- v1 requirements: 59 total (6 AUTH + 15 DATA + 13 ATTR + 13 DASH + 12 PLAT)
- Mapped to phases: 59 / 59 ✓
- Unmapped: 0
- Per-phase totals: P1=5, P2=15, P3=13, P4=13, P5=7, P6=6 (sum = 59)

---
*Requirements defined: 2026-05-10*
*Traceability populated: 2026-05-10 by roadmapper*
*Last updated: 2026-05-10 after roadmap creation*
