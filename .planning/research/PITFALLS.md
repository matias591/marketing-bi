# Pitfalls Research

**Domain:** Marketing-attribution BI on Salesforce + Supabase + Vercel (internal, 4–10 users, 2–4 week v1)
**Researched:** 2026-05-10
**Confidence:** HIGH for platform limits (Context7-verified Vercel/Supabase docs); MEDIUM-HIGH for Salesforce/attribution domain pitfalls (well-documented behavior + community wisdom).

This file is opinionated. The project's constraints (greenfield, daily sync, ~15K Contacts, free tiers, 4–10 users, 2–4 weeks) are baked into every recommendation. "Test thoroughly" is not a prevention strategy — concrete actions only.

---

## Critical Pitfalls

### Pitfall 1: Trigger-cascade days produce "everything changed today" syncs that blow the cron timeout

**Category:** Salesforce data
**Severity:** CRITICAL — daily sync silently grows from 30s → 8min and breaks at the worst moment.

**What goes wrong:** A Salesforce admin runs a flow/Apex update that touches every Contact (e.g., reformatting a custom field, recomputing a formula, mass-reassigning Account ownership). Every Contact's `LastModifiedDate` flips to "today." The next daily incremental sync, which normally pulls 200 changed rows, suddenly tries to pull 15,000. With Campaign Member cascades it can be 200K+ rows in one cron invocation.

**Why it happens:** `LastModifiedDate` is the only reliable watermark Salesforce exposes for incremental pulls, and it's updated by ANY field change — including system-driven ones. Vercel Hobby plan caps function duration at **300 seconds**. A REST query at ~2K rows/page over a high-latency connection blows past that. Bulk API 2.0 jobs are async, but if you naively `await` a `getAllJobResults` call inside a single function invocation, the function still hits 300s while polling.

**Warning signs:** Sync duration jumps day-over-day by more than 3x; Vercel function timeout errors in the deploy log on the cron run; Salesforce API call count spikes (Setup → System Overview → API Usage); row-count delta in the sync log is >10% of total table size.

**Prevention strategy:**
1. Use Bulk API 2.0 for any object that ever exceeds 5K row delta. Submit a job, return 202, then poll the job in a separate cron invocation 10 minutes later. Don't try submit + wait + ingest in one function.
2. Hard cap rows per cron run. If today's delta is >50K rows for a single object, sync a watermark-bounded window (`LastModifiedDate >= X AND LastModifiedDate < X + 1h`) and resume tomorrow. Track resume state in a `sync_cursors` table.
3. Detect mass-update events explicitly. If row count for one object is >20% of total, log a `mass_update_detected` flag and Slack the team — don't auto-truncate but don't silently break either.
4. Run Bulk API for Campaign Member from day 1 — highest-volume table, most likely cascade victim.

**Phase to address:** Phase 1 (Sync Infrastructure). The cron must be Bulk-API-capable from the first sync invocation, not retrofitted later.

---

### Pitfall 2: Vercel Hobby cron runs "any time within the hour" — not at the minute you specified

**Category:** Vercel platform
**Severity:** HIGH — silently breaks SLAs and confuses on-call when a user reports "data is stale."

**What goes wrong:** You schedule the sync for `0 5 * * *` (5:00 AM UTC) expecting it to land at 5:00. Vercel docs explicitly state: *"Vercel may invoke hobby cron jobs at any point within the specified hour to help distribute load."* So your sync may fire at 5:47 AM. The dashboard's "last sync at" timestamp is non-deterministic by ~1 hour.

**Warning signs:** Users say "the dashboard showed 5:00 AM data this morning, now it shows 5:47 AM data — did something break?"; "Last sync at" drift in support requests; cron runs at expected time during dev (manually triggered) but appears to drift in production.

**Prevention strategy:**
1. Schedule the cron at least 1 hour earlier than the latest acceptable freshness.
2. Display freshness from `MAX(synced_at)` in the data, not the cron schedule. UI shows "Synced 2h 14m ago" — never "Schedule: daily at 5 AM."
3. Note this in the runbook.
4. If sub-hour precision becomes a hard requirement, Pro plan ($20/mo) gives minute-precision crons.

**Phase to address:** Phase 1 (Sync Infrastructure).

---

### Pitfall 3: Vercel Hobby cron is once-per-day MAX — not "as often as you want"

**Category:** Vercel platform
**Severity:** HIGH — discovered at deploy time, blocks the workaround pattern.

**What goes wrong:** You realize chunking the sync (Pitfall 1) into per-object crons gives you headroom on the 300s limit, so you write `vercel.json` with multiple crons at different times each running once per day. This deploys fine. But if you try `*/30 * * * *` or `0 * * * *` on Hobby, deployment fails with: *"Hobby accounts are limited to daily cron jobs."*

**Prevention strategy:**
1. Plan the sync as N daily crons, staggered by hour, from day 1. Sketch the cron lineup before writing code: `5 AM Contacts → 6 AM Campaigns → 7 AM Campaign Members → 8 AM Opps + OCR → 9 AM Presentations → 10 AM build attribution materialized views`.
2. Build per-object sync as separate API routes — independently retriable, below the 300s budget.
3. For polling Bulk API jobs, schedule a "job-poller" cron that runs daily at 11 AM and ingests any Bulk API jobs submitted in the prior crons.
4. If real-time/hourly becomes required: upgrade to Pro. Don't fake hourly with five staggered daily crons.

**Phase to address:** Phase 1 (Sync Infrastructure).

---

### Pitfall 4: Supavisor in transaction mode + `pg` prepared statements = silent broken queries

**Category:** Vercel + Supabase platform
**Severity:** CRITICAL — looks fine in dev, dies under any concurrency.

**What goes wrong:** With direct connection (port 5432), every cold-start opens a new Postgres connection — Supabase free tier caps at ~60 direct connections. With Supavisor transaction mode (port 6543), prepared statements break because each query may run on a different backend connection. Supabase docs: *"transaction mode does not support prepared statements."*

**Warning signs:** Errors like `prepared statement "s_1" does not exist` in production logs; dashboard works fine for one user, breaks intermittently with two; "First query after deploy works, second query times out."

**Prevention strategy:**
1. Pick one and document from day 1:
   - **Recommended:** Supabase JS client (`@supabase/supabase-js`) over the REST/PostgREST API for dashboard queries — uses HTTP, no connection pooling concern.
   - **For the sync (cron):** Use direct Postgres only via Supavisor session mode (port 5432 pooler) OR use the Supabase JS client for inserts. The cron is one writer, no concurrency issue.
2. If you must use `pg` driver from Vercel: connect via port 6543 (Supavisor transaction mode) AND disable prepared statements (`prepare: false` for `postgres-js`; `?pgbouncer=true` for Prisma).
3. Smoke test concurrency before declaring "done" — run 5 parallel dashboard requests in CI/dev.

**Phase to address:** Phase 1 (Sync Infrastructure) for the cron writer; Phase 2 (Dashboard MVP) for the read path.

---

### Pitfall 5: Vercel Edge runtime accidentally pulls in `pg` and the build fails

**Category:** Vercel platform
**Severity:** MEDIUM — caught at build, but eats half a day if you don't recognize the symptom.

**What goes wrong:** You set `export const runtime = 'edge'` on a route. The route imports something that transitively imports `pg`. Build error: *"The edge runtime does not support Node.js 'net' module."*

**Prevention strategy:**
1. Default to `nodejs` runtime for all API routes. Don't use Edge for this project.
2. If you really want Edge for some routes: use `@supabase/supabase-js` exclusively (HTTP). Never import `pg`, `postgres`, or any node-native driver in those routes.
3. Middleware (`middleware.ts`) is Edge by default. Don't put DB queries in middleware.

**Phase to address:** Phase 1 + Phase 2.

---

### Pitfall 6: HubSpot's `Original Source` gets rewritten when a Contact's email changes

**Category:** Attribution logic
**Severity:** CRITICAL — first-touch attribution becomes wrong months after a Contact's email update, with no audit trail.

**What goes wrong:** PROJECT.md says first-touch is read directly from `Original Source` on the Contact (HubSpot-fed). When a Contact's email changes, HubSpot may re-evaluate `Original Source` based on the new identity stitch — or customer admins have set up workflows that overwrite `Original Source` under conditions like merges or manual cleanups. The Contact who was "first-touched: Webinar A" 18 months ago now reads "first-touched: Sales Outreach" because someone fixed their email last week.

**Warning signs:** A campaign you ran last quarter shows fewer first-touches today than it did last week; comparing this week's "Closed Won attributed to Campaign X" to a screenshot from last month and seeing different numbers for closed deals from before that timeframe; marketing ops asks "did you change the math?" — the math didn't change, the field upstream did.

**Prevention strategy:**
1. **Snapshot `Original Source` and `Latest Source` into a history table on every sync.** Build `contact_source_history (contact_id, original_source, latest_source, observed_at)` with one row per sync. Attribution queries should use the value as-of the lifecycle transition date, not the current value.
2. Document the field semantics in the dashboard (tooltip: "Source recorded at the time of MQL transition").
3. Prefer MQL Date snapshot of the source field over current value.
4. Validate this assumption against Salesforce admins before locking the spec.

**Phase to address:** Phase 1 (Sync Infrastructure) — snapshot history table is a schema decision, not a feature.

---

### Pitfall 7: Multi-touch attribution unbounded by time creates noise, not signal

**Category:** Attribution logic
**Severity:** HIGH — produces "every campaign matters equally" output, the dashboard becomes useless.

**What goes wrong:** PROJECT.md spec: *"Multi-touch (linear) attribution: every campaign a Contact was a member of between Contact creation and each lifecycle milestone."* For a Contact who's been in the system 3 years and been added to 80 nurture campaigns, linear attribution gives every campaign 1/80 credit. Aggregate across 15K Contacts and the top 50 campaigns are all within 2% of each other — chart says "everything works equally well" = "we have no idea what works."

**Warning signs:** Top campaigns by attributed SQLs are all generic newsletters; distribution of credit across campaigns is suspiciously flat (CV < 0.3); marketing's intuition disagrees with the dashboard.

**Prevention strategy:**
1. **Cap multi-touch window at 90 days before the lifecycle transition by default.** Make this configurable but NOT zero. From v1: "Linear credit across campaigns the Contact engaged with in the 90 days prior to SQL transition."
2. Exclude system-added campaign memberships. Treat only "Responded" memberships as touchpoints.
3. Surface the touchpoint count alongside attribution.
4. Add a "first-touch in window" alternative view in the same dashboard.

**Phase to address:** Phase 3 (Attribution Engine) — windowing decision is the most important spec the engine encodes.

---

### Pitfall 8: Validating against Salesforce reports — days lost to "is our math wrong, or is SF wrong?"

**Category:** Project execution
**Severity:** HIGH — derails the timeline, demoralizes the team, hard to recover from.

**What goes wrong:** You build first-touch attribution, show the marketing director, they say "but Salesforce's Campaign Influence report says Campaign X drove 23 SQLs and yours says 18." Two days lost. The answer is usually: the SF report uses a different definition (Customizable Campaign Influence with a different attribution model, lookback window, or deletion handling). Both numbers are "right" for their respective definitions.

**Prevention strategy:**
1. **Pre-launch, write a one-pager: "How our attribution differs from Salesforce native."** Cover: which model, which Campaign Member statuses count, time-window definition, dedupe rules, exclusion of deleted/merged Contacts. Get marketing director sign-off on this BEFORE building dashboards.
2. Display the methodology in-app. Every dashboard has a "How this is computed" link in the header.
3. Pick ONE Salesforce report to validate against and reproduce its math exactly.
4. Time-box reconciliation. If a number doesn't match and you can't explain it in 4 hours, ship anyway with a footnote.

**Phase to address:** Phase 0 (Spec) — methodology one-pager is a prerequisite for any attribution code.

---

### Pitfall 9: Supabase free tier pauses after 7 days of low activity — your sync stops silently

**Category:** Supabase platform
**Severity:** MEDIUM — recovery is fast but discovery can be days late.

**What goes wrong:** Marketing team uses tool heavily for 2 weeks, then takes a holiday. 7 days of low activity later, Supabase pauses the project. The cron continues to fire and fails silently.

**Prevention strategy:**
1. The daily sync cron itself counts as activity — ensure it actually connects (issue at least one DB query even on no-change days).
2. Add a "keep-alive" query at the start of each cron invocation.
3. Slack a sync failure alert.
4. Display freshness prominently. Green/yellow/red.
5. If team adoption is bumpy: upgrade Supabase to Pro ($25/mo) before launch.

**Phase to address:** Phase 1 (Sync Infrastructure).

---

### Pitfall 10: Custom-field drift breaks the schema and historical data

**Category:** Salesforce data
**Severity:** MEDIUM — caught at sync time but the recovery path matters.

**What goes wrong:** A Salesforce admin renames or deletes a custom field. Next sync: `INVALID_FIELD: No such column 'Demo_Outcome__c'`. Sync fails entirely.

**Prevention strategy:**
1. Don't fail the entire sync on a missing field. Catch `INVALID_FIELD` errors, log which field, retry with that field excluded.
2. Run a daily schema-introspection query before the data sync. `SELECT QualifiedApiName FROM FieldDefinition WHERE EntityDefinition.QualifiedApiName = 'Presentation__c'`. Slack a diff alert.
3. Define field-list as a typed config (`salesforce-fields.ts`), not inline strings.
4. Quarantine unknown rows, don't drop them.

**Phase to address:** Phase 1 (Sync Infrastructure).

---

### Pitfall 11: Campaign Member duplication produces double-counted touchpoints

**Category:** Salesforce data
**Severity:** MEDIUM — easy to miss, contaminates attribution.

**What goes wrong:** Same Contact added to "Webinar — Q2 Product Launch" three times: once when registering, once when attending, once when watching the recording. SF stores three Campaign Member rows. Naive multi-touch counts the Contact-Campaign pair 3 times.

**Prevention strategy:**
1. In the attribution engine, dedupe on (ContactId, CampaignId) before computing credit. Use the earliest `CreatedDate` as the touchpoint timestamp.
2. Build a `touchpoints` materialized view that does this dedupe — define touchpoint table once with `SELECT DISTINCT ON (contact_id, campaign_id) ...` and use that everywhere.
3. For status semantics, store the LATEST status on the deduped row.
4. Display unique-Contact-count, not Campaign-Member-count, in campaign-level metrics.

**Phase to address:** Phase 3 (Attribution Engine).

---

### Pitfall 12: Soft-deletes (`IsDeleted=true`) and Contact merges silently corrupt historical attribution

**Category:** Salesforce data
**Severity:** MEDIUM — invisible until someone notices a deal is missing from the deal-attribution dashboard.

**What goes wrong:** A Contact tied to a Closed Won deal gets merged with another Contact. Salesforce keeps the surviving Contact, soft-deletes the loser. Your daily sync queries `WHERE LastModifiedDate >= X` — by default, this DOESN'T return `IsDeleted=true` rows. Your warehouse still has the deleted Contact's row, but its lifecycle stage and Campaign Memberships are no longer canonical. When a Contact is **merged**, Campaign Member rows are reassigned to the surviving Contact — your warehouse will have the campaign memberships under both Contact IDs after the next sync.

**Prevention strategy:**
1. **Use `queryAll`** (Bulk API "queryAll" or REST `/queryAll`) for Contact, Account, and Campaign Member. Sync them with their `IsDeleted` flag — don't drop them from your warehouse.
2. Periodically (weekly) run a full reconciliation pass.
3. In attribution queries, filter `WHERE NOT contacts.is_deleted`.
4. Add a weekly "full refresh" cron that does a `queryAll` of just IDs.

**Phase to address:** Phase 1 (Sync Infrastructure) for `queryAll`; Phase 3 (Attribution Engine) for the deleted-filter rule.

---

### Pitfall 13: Authentication setup (Google Workspace OAuth Consent Screen) is a 2-day blocker no one anticipated

**Category:** Project execution
**Severity:** MEDIUM — high probability, easily mitigated by sequencing.

**What goes wrong:** Day 14 of a 21-day project. Time to ship. Setting up Google OAuth in Supabase requires admin approval and possibly an internal "trusted" listing. Workspace admin is on PTO. 3-day wait.

**Prevention strategy:**
1. **PROJECT.md already specifies a fallback: "email + password as fallback if Google OAuth setup is blocked."** Use this. Build email/password (or magic-link) auth FIRST in Phase 0 or Phase 1. Treat Google OAuth as a Phase 2 enhancement.
2. Day 1 of the project: file a ticket with the Workspace admin. "We need a Google OAuth Client ID for an internal tool, redirect URI `https://<project>.supabase.co/auth/v1/callback`, publishing status: internal."
3. Use Supabase's email-link / magic-link auth as a middle ground.
4. Allowlist by email domain in the auth handler.

**Phase to address:** Phase 0 (Spec) — file the OAuth ticket. Phase 1/2 (Auth) — ship password/magic-link first.

---

### Pitfall 14: "Self-service chart builder" scope creep when users say "can I just tweak this one chart?"

**Category:** Project execution
**Severity:** HIGH — the explicit out-of-scope item that will be requested constantly.

**What goes wrong:** Three days after launch, marketing director: "This 'Campaign Contribution to SQLs' chart — can I see it broken down by week instead of month? And filter to just outbound campaigns? And save that view? Add a YoY comparison?" Each request sounds tiny. Three weeks later you've built half of Tableau and shipped no other dashboards.

**Prevention strategy:**
1. PROJECT.md explicitly lists chart builder as Out of Scope. Print it. Stick it on the wall.
2. **Define "pivot-style explorable" in writing.** v1 = each dashboard has up to 4 pre-defined dimensions to slice by. Any new dimension is a code change with PR review.
3. Add a "Request a chart" button that opens a Slack/email link.
4. Time-box dashboard tweaks at 30 minutes per request after launch.

**Phase to address:** Phase 0 (Spec) — pivot-dimension contract per dashboard. Phase 6 (Launch) — feedback intake process.

---

### Pitfall 15: Sync-first death march — week 3 ends with a perfect data warehouse and zero dashboards

**Category:** Project execution
**Severity:** CRITICAL — ships nothing, fails the timeline.

**What goes wrong:** Engineers love data plumbing. The sync becomes a fun puzzle. Three weeks in: bulletproof sync, beautiful schema, comprehensive attribution engine — and not one dashboard. Marketing has nothing to look at.

**Prevention strategy:**
1. **Vertical-MVP slicing from day 1.** End of week 1: a hardcoded SQL query feeding a single table on a single dashboard page deployed to Vercel. Ugly, missing data, but real.
2. **Stub the sync.** For the first dashboard prototype, use a one-time CSV export from Salesforce loaded into Supabase. Build the dashboard against static data. Replace with the live cron in week 2.
3. Calendar a demo for end of week 1 with the marketing director. External commitment forces the vertical slice.
4. Track "screens shipped" weekly, not "tables synced."

**Phase to address:** Roadmap structure — Phase 1 should produce a (stub-data) dashboard, NOT a complete sync.

---

## Additional Pitfalls (briefer treatment)

### Salesforce data (extras)

**Pitfall 16: Picklist value renames break historical reports.** When "Campaign Type = Webinar" is renamed to "Live Webinar," historical Campaign rows update. **Prevention:** Snapshot picklist values at sync time into a `campaigns_history` table. **Phase:** Phase 1.

**Pitfall 17: Timezone confusion — UTC vs. PT vs. user-local "yesterday."** SF stores UTC. Marketing in NYC asks "yesterday's leads" expecting Eastern Time, but Postgres `CURRENT_DATE - 1` uses UTC. **Prevention:** Project-wide "business timezone" config (e.g., `America/New_York`); convert all date filters via `AT TIME ZONE`; show TZ in date filter UI. **Phase:** Phase 2.

### Attribution logic (extras)

**Pitfall 18: Off-by-one — touchpoints AFTER lifecycle transition counted as PRE-transition credit.** Using `<=` includes same-day post-transition touches. **Prevention:** Use strict `<` not `<=`; document the boundary. **Phase:** Phase 3.

**Pitfall 19: Lifecycle stage double-counting.** A Contact transitions MQL → SQL → Opp → Customer. Computing "campaigns that drove Customer" as "campaigns engaged with before Customer Date" counts campaigns that drove SQL AND Opp AND Customer all three times. **Prevention:** Spec explicitly: linear-credit-per-stage means each stage is its own attribution event; total attributed credit per Contact = N stages × 1.0. **Phase:** Phase 0 + Phase 3.

**Pitfall 20: Account reassignment.** A Contact changes Accounts. Whose Account gets credit for past Campaign engagement? **Prevention:** Snapshot `account_id` at the time of each lifecycle event; account-rollups should use the as-of Account, not current Account. **Phase:** Phase 3.

**Pitfall 21: Multi-OCR Opportunity credit splitting.** Closed Won Opp has 5 OCR Contacts with different campaign histories. **Prevention:** v1 uses equal split across OCR Contacts; document this. v2 can weight by `OpportunityContactRole.Role`. **Phase:** Phase 3 (decision in spec).

### Vercel + Supabase platform (extras)

**Pitfall 22: Supabase RLS performance on aggregations.** RLS policies that re-evaluate on every row turn `SELECT COUNT(*) FROM campaign_members` into O(n × policy-check). **Prevention:** Single-tenant — disable RLS for analytics tables OR write RLS policies that resolve to `true`/`false` per query. Use materialized views (RLS doesn't apply to MV refresh). **Phase:** Phase 3.

**Pitfall 23: Cold-start latency on serverless dashboards.** First request 2–3s after idle. **Prevention:** Accept for v1; if unacceptable, 5-min keep-warm cron OR Vercel Fluid Compute (Pro). **Phase:** Phase 4.

### Dashboard / UX (extras)

**Pitfall 24: Charts that load incrementally show partial state.** **Prevention:** Skeleton-load entire page; OR explicit "Loading..." overlay per chart. **Phase:** Phase 4.

**Pitfall 25: Filter state not in URL.** Refresh = lose filters. Sharing = doesn't share view. **Prevention:** Sync all filter state to URL params via Next.js `useSearchParams`. **Phase:** Phase 4.

**Pitfall 26: 12 charts on one page that re-query on every filter change.** **Prevention:** Cap each dashboard at 3–4 primary charts; batch all charts' data into one query per page. **Phase:** Phase 4.

**Pitfall 27: Sankey/journey diagram with >20 distinct campaigns.** Visual spaghetti. **Prevention:** Cap top-N campaigns; aggregate the rest as "Other (N campaigns)"; primary view = numerical table, Sankey = secondary garnish. **Phase:** Phase 4.

**Pitfall 28: "Mobile-readable" interpreted as "we put charts on a phone."** **Prevention:** Test every page at 390×844; charts that don't reflow → KPI cards + "View on desktop for full chart" link. **Phase:** Phase 4.

### Project execution (extras)

**Pitfall 29: Premature dbt / data-stack adoption.** Engineer adds dbt because "real BI uses dbt." **Prevention:** Plain SQL files + Postgres materialized views are sufficient at this scale. Revisit dbt only if (a) sync sources expand beyond Salesforce, OR (b) >10 users authoring transformations. **Phase:** Phase 0.

**Pitfall 30: Premature monitoring / observability stack.** Datadog, Sentry, OpenTelemetry. **Prevention:** v1 = Vercel logs + Slack webhook on cron failures + Supabase dashboard for DB. **Phase:** Phase 5.

---

## Pitfall-to-Phase Mapping (for the roadmapper)

| # | Pitfall | Prevention Phase | Verification |
|---|---------|------------------|--------------|
| 1 | Trigger-cascade timeout | Phase 1 (Sync Infra) | Forced 50K+ row delta test in dev; Bulk API path exercised |
| 2 | Cron timing drift | Phase 1 (Sync Infra) | Freshness UI shows actual sync time; runbook documents hour-window |
| 3 | Hobby once-per-day cron limit | Phase 1 (Sync Infra) | `vercel.json` has N daily-frequency entries; deploy succeeds |
| 4 | Supavisor + prepared statements | Phase 1 + Phase 2 | 5 concurrent dashboard requests pass; no `prepared statement` errors |
| 5 | Edge runtime breaks `pg` | Phase 1 / Phase 2 | All API routes use `nodejs` runtime; build succeeds |
| 6 | `Original Source` rewrites | Phase 1 (Sync Infra) | `contact_source_history` table exists from first sync |
| 7 | Unbounded multi-touch | Phase 3 (Attribution) | Top campaigns by attribution are not all newsletters; CV across top 10 > 0.5 |
| 8 | SF report reconciliation | Phase 0 (Spec) | Methodology doc signed off; reconciliation against one SF report within 1% |
| 9 | Supabase free-tier pause | Phase 1 (Sync Infra) | Cron has keep-alive query; Slack alert fires on sync error |
| 10 | Custom-field drift | Phase 1 (Sync Infra) | Schema-introspection cron runs; missing-field error doesn't kill full sync |
| 11 | Campaign Member duplication | Phase 3 (Attribution) | `touchpoints` view dedupes on (contact, campaign) |
| 12 | Soft-deletes / merges | Phase 1 + Phase 3 | `queryAll` used; attribution filters `is_deleted` |
| 13 | Google OAuth blocked | Phase 0 + Phase 2 (Auth) | OAuth ticket filed Day 1; email/password fallback ships before OAuth |
| 14 | Chart-builder scope creep | Phase 0 + Phase 6 (Launch) | Pivot dimensions documented per dashboard |
| 15 | Sync-first death march | Phase 1 must produce a screen | End of week 1: dashboard URL exists, even if stub-fed |
| 16 | Picklist value renames | Phase 1 (Sync Infra) | `campaigns_history` table snapshots picklist values |
| 17 | Timezone "yesterday" confusion | Phase 2 (Dashboard MVP) | Project TZ config; date filters convert via `AT TIME ZONE` |
| 18 | Off-by-one on transition boundary | Phase 3 (Attribution) | Test: same-day touchpoint excluded from "before transition" credit |
| 19 | Lifecycle stage double-counting | Phase 0 + Phase 3 | Methodology doc explicit on per-stage attribution semantics |
| 20 | Account reassignment | Phase 3 (Attribution) | `account_id` snapshotted at lifecycle event |
| 21 | Multi-OCR Opp credit splitting | Phase 3 | Equal split documented; Role weighting deferred to v2 |
| 22 | Supabase RLS aggregation perf | Phase 3 (Attribution) | Analytics tables: RLS off OR policies are query-level, not row-level |
| 23 | Cold-start latency | Phase 4 (Dashboards) | Accepted; documented; revisit if user complaints |
| 24 | Partial chart load | Phase 4 (Dashboards) | Page-level skeleton OR per-chart loading overlay |
| 25 | Filter state not in URL | Phase 4 (Dashboards) | Refresh preserves all filters |
| 26 | Filter click = 100+ queries | Phase 4 (Dashboards) | Each page caps at 3–4 primary charts; queries batched |
| 27 | Sankey unreadable | Phase 4 (Contact Journey) | Top-N cap; "Other" bucket; numerical table primary |
| 28 | Mobile broken | Phase 4 (Dashboards) | Test on real iPhone + Android |
| 29 | Premature dbt | Phase 0 (Stack) | Stack doc explicitly: no dbt for v1 |
| 30 | Premature observability stack | Phase 5 (Post-Launch) | v1 = Vercel logs + Slack webhook only |

---

## "Looks Done But Isn't" Checklist

- [ ] **Daily sync:** Forced failure (e.g., revoke SF token) fires Slack alert within 1 hour.
- [ ] **First-touch attribution:** Re-running the report a week later for same date range produces same numbers (Pitfall 6).
- [ ] **Linear multi-touch:** Contact with 80 lifetime memberships isn't giving 1/80 credit each (Pitfall 7).
- [ ] **Campaign Member touchpoints:** Touchpoint count for a campaign matches `COUNT(DISTINCT contact_id)` (Pitfall 11).
- [ ] **Account rollup:** Behavior verified when a Contact moves Accounts.
- [ ] **Closed Won attribution with multiple OCR Contacts:** Doc explicitly says how credit is split.
- [ ] **Dashboard freshness UI:** Updates after a manual sync trigger.
- [ ] **Auth allowlist:** Curl with non-allowlisted JWT is rejected at the API.
- [ ] **Filter state:** Refreshing preserves all filters.
- [ ] **Mobile responsiveness:** iPhone 390×844 and Android 360×800.
- [ ] **Soft-deletes:** Deleting a Contact in SF causes warehouse to mark deleted within 24h (Pitfall 12).
- [ ] **Sync resume:** Killing cron mid-sync and re-running doesn't double-insert or skip rows.
- [ ] **Methodology doc:** A single page explaining how attribution differs from Salesforce native (Pitfall 8).
- [ ] **`CRON_SECRET` verification:** All cron routes return 401 to unauthenticated curl.
