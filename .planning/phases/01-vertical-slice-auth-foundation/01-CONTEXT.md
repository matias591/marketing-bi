# Phase 1: Vertical Slice + Auth Foundation - Context

**Gathered:** 2026-05-10
**Status:** Ready for planning

> ⚠ **Scope shift during discussion — ROADMAP.md needs updating.** Phase 1 originally bounded as "auth + deploy + chart from seeded fixture data, NO sync work" (per Pitfall 15 mitigation). User chose to pull live Salesforce ingestion forward into Phase 1. Most of original Phase 2 (DATA-01..DATA-06, DATA-09..DATA-13, DATA-15) now belongs to Phase 1. ROADMAP.md success criterion #4 ("renders a bar chart from a seed fixture (no live sync yet)") and the P1↔P2 boundary must be updated before planning. Estimated revised P1 timeline: 2–3 weeks (was: ~1 week).

<domain>
## Phase Boundary

A deployed Vercel Next.js 16 app where:
1. An admin (`matias@orca-ai.io`, seeded by SQL migration) and any users they invite via Supabase Studio can sign in with email + password (custom shadcn `/login` form, `@supabase/ssr` cookies).
2. A Postgres `BEFORE INSERT` trigger on `auth.users` rejects any email whose domain is not `orca-ai.io` with a specific error message.
3. Any `/dashboard/*` route hit while signed-out redirects to `/login`.
4. A weekly Vercel Cron pulls all 7 SF objects (`Contact`, `Account`, `Campaign`, `CampaignMember`, `Opportunity`, `OpportunityContactRole`, `Presentation__c`) into `raw.sf_*` Postgres tables via OAuth 2.0 JWT Bearer Flow + `@jsforce/jsforce-node`.
5. `ops.contact_source_history` and `ops.campaigns_history` snapshot tables are populated on every cron run from the FIRST run forward (Pitfall 6 — non-recoverable if delayed).
6. `/dashboard/campaigns` renders one ECharts bar chart of "Campaign Contribution to SQLs" computed live from the `raw.sf_*` tables in Postgres.
7. The dashboard ships behind a full app shell (sidebar with all 5 future dashboards listed; Campaigns enabled; the other 4 disabled with "Coming soon"; user menu with sign-out; header freshness pill).
8. All API/Route Handlers that touch DB or Salesforce declare `runtime = 'nodejs'` (PLAT-12). No Edge runtime anywhere on the SF/DB hot path.

**Explicitly out of scope for Phase 1 (still belongs to later phases):**
- Daily cron promotion (P2 — start weekly, promote later)
- Slack alerts on sync failure (P2/P6)
- One-shot historical backfill script (P2 — `pnpm seed:from-sf` for go-forward only is fine)
- `INVALID_FIELD` resilience polish (P2 — basic try/catch is fine; the full DATA-12 behavior comes later)
- `/admin/sync` and `/admin/users` UIs (P6)
- Google SSO (P6)
- Attribution marts (`mart.touchpoints`, `mart.attribution_*`) — P3
- Other 4 dashboards (P4–P6)

</domain>

<decisions>
## Implementation Decisions

### Authentication & Sign-up Flow
- **D-01: Invite-only model.** Admin pre-creates users in Supabase Studio (no public sign-up endpoint). Phase 1 ships zero `/admin/users` UI — admin operates entirely from Supabase Studio.
- **D-02: Two roles, stored on the user record.** `role: 'admin' | 'end_user'` lives as a column on a `profiles` table linked to `auth.users.id`, OR in `raw_user_meta_data` JSONB — planner picks. Phase 1 only stores the role; permission checks against it ship with `/admin/*` routes in Phase 6.
- **D-03: First admin seeded by SQL migration.** A one-shot migration inserts/upserts `matias@orca-ai.io` with `role = 'admin'` after the allowlist trigger is created. Migration order: trigger first, then admin upsert (admin email is on the allowlist, so it passes).
- **D-04: Custom shadcn login form, not `@supabase/auth-ui-react`.** Confirms STACK research lock. Path: `/login`. Calls `supabase.auth.signInWithPassword`.
- **D-05: First-login flow for invitees.** Invite email link → `/auth/confirm?token_hash=...&type=invite` (calls `supabase.auth.verifyOtp` server-side) → redirect to custom `/auth/set-password` (shadcn form, calls `supabase.auth.updateUser({ password })`) → redirect to `/dashboard/campaigns`.
- **D-06: Subsequent logins.** `/login` shadcn form → `signInWithPassword` → redirect to `/dashboard/campaigns`. Sessions persist via `@supabase/ssr` HTTP-only cookies (AUTH-05).
- **D-07: Invite delivery uses Supabase default email (free tier).** No custom SMTP in Phase 1. Email-template copy in Supabase Studio is fine to customize for branding. Custom SMTP (Resend, etc.) deferred — small recipient count makes it unnecessary.

### Domain Allowlist
- **D-08: Single domain, hardcoded in trigger SQL.** `orca-ai.io` only. Trigger is `BEFORE INSERT` on `auth.users` and raises an exception on non-allowlisted domains. Future domain additions = new migration (`CREATE OR REPLACE FUNCTION` updating the hardcoded list).
- **D-09: Specific rejection error.** Trigger raises: `Cannot invite {email} — only @orca-ai.io email addresses are allowed.` Admin sees this when calling `inviteUserByEmail` from Studio. Internal tool, no info-leak risk.
- **D-10: Case-insensitive comparison.** Compare `lower(split_part(NEW.email, '@', 2))` against the allowlist. Standard email normalization.

### Live Salesforce Data (replaces "seed fixture")
- **D-11: Phase 1 chart reads live SF data, not stub data.** User explicitly chose this over (A) fixture-from-CSV and (C) stub data, knowing the timeline and Pitfall 15 implications. CONTEXT.md and the planner must flag the timeline impact and the ROADMAP-update requirement.
- **D-12: Weekly Vercel Cron, all 7 SF objects.** Schedule: weekly (one cron run, e.g., `0 6 * * 0` — Sunday 06:00 UTC; planner confirms the exact day/hour). Objects: `Contact`, `Account`, `Campaign`, `CampaignMember`, `Opportunity`, `OpportunityContactRole`, `Presentation__c`. Daily promotion happens in Phase 2 with whatever staggering is needed.
- **D-13: Read direction.** Cron pulls SF → Postgres `raw.sf_*` tables (1:1 with SF schema, idempotent upsert on Salesforce Id). Server Components query Postgres via Drizzle for chart data. No on-demand SF reads on the page-load hot path.
- **D-14: SF auth = OAuth 2.0 JWT Bearer Flow.** Connected App in Salesforce + self-signed cert + private key in Vercel env vars. `@jsforce/jsforce-node` 3.10.x via `conn.authorize({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: signedJwt })`. `jsonwebtoken` for JWT signing.
- **D-15: Snapshot tables ship with the first sync (Pitfall 6 — MANDATORY).** `ops.contact_source_history` (per-Contact `Original Source` / `Latest Source` snapshots) and `ops.campaigns_history` (campaign picklist value snapshots) populate on every cron run from the FIRST run. These cannot be backfilled later — wait one cycle and history is permanently lost. This is the one P2 element the planner must NOT defer or trim.
- **D-16: Sync infrastructure tables.** `ops.sync_runs` (run lifecycle: started_at, finished_at, status, row_counts, error) and `ops.sync_errors` (per-object errors) ship in Phase 1 for the cron to write into. Per-object `LastModifiedDate` watermarks are in scope. The `/admin/sync` page that READS these tables is still P6.
- **D-17: SF read uses `queryAll` for Contact / Account / CampaignMember.** Soft-deletes (`IsDeleted=true`) are mirrored, not silently dropped (Pitfall 12). Bulk API 2.0 for `CampaignMember` from day 1; REST `query` for the small objects.
- **D-18: Phase 1 chart query is computed live in SQL against `raw.sf_*`.** No `mart.*` materialized views in Phase 1 (those are P3). The query is a hand-written CTE/JOIN that counts Contacts in SQL stage per Campaign. Phase 3 replaces this with `mart.attribution_contact` reads.

### Dashboard Shell
- **D-19: Full shell with sidebar + freshness pill.** Sidebar lists all 5 future dashboards (Campaigns, Revenue, Journey, Accounts, Touchpoint Depth). Campaigns is the only enabled link in P1; the other 4 are disabled with a "Coming soon" tooltip. Top-right user menu with sign-out. Header includes a freshness pill reading `MAX(synced_at)` from `ops.sync_runs`.
- **D-20: Weekly-tuned freshness thresholds.** Green `<8 days`, yellow `8–15 days`, red `>15 days`. Daily-tuned thresholds (green `<24h`, yellow `24–48h`, red `>48h`) from PLAT-05 are kept as named constants in code so they can be swapped when sync moves to daily in P2.
- **D-21: Methodology link placeholder.** A "How attribution is computed" link in the header points to a stubbed `/methodology` page that says "Coming in Phase 3" — placeholder reserves the URL space (ATTR-12 ships there).

### Platform / Runtime
- **D-22: `runtime = 'nodejs'` everywhere DB or SF code runs (PLAT-12).** Both Server Components that read Postgres and Route Handlers that hit Salesforce must export this. `@jsforce/jsforce-node` and `postgres` (porsager) require Node APIs.
- **D-23: Supavisor transaction-mode pooling for all DB connections.** Connection string targets port 6543 (transaction mode), `prepare: false`, `max: 1` per function invocation. Direct connections (port 5432) are forbidden. STACK research locked this; Pitfall 4 warns about this exact failure mode.
- **D-24: Drizzle ORM 0.45.x + `postgres` (porsager) 3.4.x.** Drizzle owns schema (single source of truth via `drizzle-kit generate`). Supabase migrations apply the generated SQL in CI.

### Claude's Discretion
- Cron schedule day/hour (planner picks a low-traffic window for the SF org, e.g., Sunday early morning UTC).
- Sidebar visual identity: shadcn defaults + project name "Marketing BI" as text — no custom logo work in Phase 1.
- Exact error copy for `/login` failures, password reset wording (defer to Phase 6 polish), etc.
- Vercel project naming + environment variable naming (planner picks conventional names, documents in README).
- Whether `role` lives on a `profiles` table or in `raw_user_meta_data`. Either is fine; planner picks based on RLS posture.
- Profile table RLS policies (research locks "permissive policies for authenticated" since single-team).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project foundation
- `.planning/PROJECT.md` — product framing, constraints, key decisions (free-tier stack, Salesforce-only ingestion, build target = "good enough for these specific attribution questions").
- `.planning/REQUIREMENTS.md` §AUTH (AUTH-01, AUTH-03, AUTH-04, AUTH-05) and §PLAT (PLAT-12) — directly mapped to Phase 1 by the roadmap.
- `.planning/REQUIREMENTS.md` §DATA — DATA-01..DATA-06, DATA-09, DATA-10, DATA-11, DATA-13, DATA-15 are now Phase 1 scope (pulled forward). Read these in addition to the AUTH/PLAT requirements above.
- `.planning/ROADMAP.md` §"Phase 1: Vertical Slice + Auth Foundation" — phase goal and (now-stale) success criteria. Planner must propose a ROADMAP.md update reflecting the scope shift before/with planning.
- `CLAUDE.md` (project root) — full stack lockdown including version pins, anti-patterns, and the recommended stack rationale. Quick orientation for any agent.

### Stack research (locked decisions, not gray areas)
- `.planning/research/STACK.md` — full stack rationale + version pins. Especially:
  - Supavisor transaction mode (port 6543, `prepare: false`, `max: 1`) for all DB connections.
  - `@jsforce/jsforce-node` (NOT `jsforce`) — 2.2 MB vs 34.5 MB; same maintainer + same version + Node-only build. Critical for Vercel function size.
  - Drizzle 0.45.x (stay on 0.x; 1.0 still RC as of May 2026) + `postgres` (porsager) driver.
  - Custom shadcn `/login` form (NOT `@supabase/auth-ui-react`, which is in maintenance).
  - `@supabase/ssr` for App Router (NOT deprecated `@supabase/auth-helpers-nextjs`).
- `.planning/research/ARCHITECTURE.md` — `raw / stage / mart / ops` schema layout, cron orchestrator skeleton, Server Component data-fetch pattern, RLS posture (permissive `authenticated` policies — single-team).
- `.planning/research/PITFALLS.md` — 30 pitfalls. Phase 1 must explicitly mitigate:
  - **Pitfall 4** (Supavisor + prepared statements) — 6543 + `prepare: false` + `max: 1`.
  - **Pitfall 5** (Edge runtime breaks `pg`) — `runtime = 'nodejs'` everywhere on the DB/SF path.
  - **Pitfall 6** (`Original Source` rewrites) — `ops.contact_source_history` populated from FIRST sync. **Mandatory; cannot be deferred.**
  - **Pitfall 13** (Google OAuth blocked) — email/password ships first; Google SSO is P6.
  - **Pitfall 15** (Sync-first death march) — planner must sequence Phase 1 work so a stub chart ships visibly BEFORE the SF cron is finished. Don't end with a perfect warehouse and zero deployed UI.
  - **Pitfall 1** (Trigger-cascade timeouts) — Bulk API 2.0 from day 1 for `CampaignMember`.
  - **Pitfall 16** (Picklist value renames) — `ops.campaigns_history` populated from FIRST sync.
  - **Pitfall 12** (Soft-deletes / merges) — `queryAll` for Contact/Account/CampaignMember.
- `.planning/research/SUMMARY.md` — TL;DR of all four research files with a build-order proposal that's now partially superseded by this discussion's scope shift.
- `.planning/research/FEATURES.md` — full feature taxonomy. Phase 1 only ships TS-4 (G1: campaign-leaderboard bars), TS-13–21 partial (login, runtime nodejs, mobile-readable layout). Everything else is later phases.

### Supabase / Auth specifics
- `.planning/research/STACK.md` §"Auth — Supabase Auth + Google OAuth + custom shadcn login" — server-side domain trigger pattern (the SQL trigger shape this phase implements).
- Supabase docs (via Context7 `/supabase/ssr` and `/supabase/auth`) — `createServerClient` patterns for App Router middleware / Server Components / Route Handlers; `signInWithPassword`; `inviteUserByEmail`; `verifyOtp` for invite flow.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **None.** Phase 1 is the first phase — no project source code exists yet. The marketing-bi/ directory contains only `CLAUDE.md` and `.planning/`.
- shadcn `<Button>`, `<Input>`, `<Label>`, `<Card>` — to be installed via shadcn CLI in Phase 1; will be reused project-wide.
- `lucide-react` icon set (shadcn standard) — to be installed in Phase 1.

### Established Patterns
- **None yet.** Phase 1 establishes:
  - The Server Component → Drizzle → Postgres data-fetch pattern (every later dashboard reuses this).
  - The `@supabase/ssr` middleware-based session refresh + Server Component auth check pattern.
  - The Vercel Cron Route Handler shape with JWT verification (`Authorization: Bearer ${CRON_SECRET}`).
  - The `raw.sf_*` table layout that Phase 2 extends.
  - The `ops.sync_runs` / `ops.sync_errors` write pattern that all subsequent sync code uses.
  - The dashboard shell layout (sidebar + header + content slot) that Phases 4–6 inherit.

### Integration Points
- **Salesforce** (external system) — JWT Bearer Flow, Connected App in SF Setup, self-signed certificate. User must perform SF-side setup (create Connected App, upload public key, enable JWT, add to permission set).
- **Supabase project** (external system) — must be created with auth enabled, allowlist trigger applied, first-admin migration applied. User must perform Supabase-side setup (create project, get connection string + anon/service-role keys, enable Google OAuth provider for later).
- **Vercel project** (external system) — must be linked to the GitHub repo, Cron job configured in `vercel.json`, env vars set (Supabase URL/keys, SF Connected App credentials, CRON_SECRET, business timezone).

</code_context>

<specifics>
## Specific Ideas

- **First admin seed:** `matias@orca-ai.io` — required by D-03.
- **Domain allowlist:** Exactly `orca-ai.io` — required by D-08.
- **Cron cadence:** Weekly (user word). Planner picks day/hour; suggest `0 6 * * 0` (Sunday 06:00 UTC) as default.
- **Freshness pill thresholds for weekly cadence:** Green <8d, yellow 8–15d, red >15d (D-20). Keep PLAT-05's daily values as named constants.
- **Methodology link target:** Stubbed `/methodology` page — content "Coming in Phase 3" — placeholder for ATTR-12.

</specifics>

<deferred>
## Deferred Ideas

- **`/admin/users` page** — admin UI to invite/list/remove users from inside the app. Deferred to Phase 6 alongside `/admin/sync` (per D-02, locked during Sign-up gating discussion).
- **Daily cron promotion** — Phase 1 ships weekly; Phase 2 promotes to daily with object-staggered cron entries (one-per-day-per-object). Phase 2 also adds Slack alerts on failure (DATA-14 — was P6 in roadmap, may move to P2).
- **One-shot historical backfill (DATA-15)** — Phase 1 syncs go-forward only via the weekly cron. The full historical backfill script (developer-laptop-driven for hundreds of thousands of CampaignMembers) belongs to Phase 2 before the daily cron stabilizes.
- **Slack alerts on sync failure (DATA-14)** — Phase 1 logs to `ops.sync_errors` only. Slack webhook integration is Phase 2 polish.
- **`INVALID_FIELD` resilience (DATA-12)** — Phase 1 catches at the per-object level (one object failing doesn't abort the whole sync) but doesn't strip-and-retry. Full resilience is Phase 2.
- **Custom SMTP for invite emails** — Phase 1 uses Supabase default (`@supabase.co` sender). Custom SMTP (Resend, AWS SES) deferred to Phase 6 polish.
- **Google SSO** — Phase 6 (per Pitfall 13 mitigation, locked in roadmap).
- **`mart.*` materialized views + attribution math** — Phase 3 (the chart query in Phase 1 is hand-written SQL against `raw.sf_*`; Phase 3 replaces it with `mart.attribution_contact` reads).
- **Side-by-side attribution-model comparison (DASH-12)** — Phase 4.
- **CSV export per chart (DASH-11)** — Phase 6.
- **Mobile KPI cards fallback (PLAT-07)** — Phase 6.

### ROADMAP.md updates required after this discussion
- Phase 1 success criterion #4 (currently: "renders a bar chart from a seed fixture (no live sync yet)") needs rewriting to reflect live SF data.
- Phase 1 requirements list expands from `AUTH-01, AUTH-03, AUTH-04, AUTH-05, PLAT-12` to also include `DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, DATA-09, DATA-10, DATA-11, DATA-13, DATA-15` (subset of P2 originals).
- Phase 2 shrinks to "promote weekly → daily, full historical backfill, Slack alerts, INVALID_FIELD resilience, AUTH-06 cron-secret hardening".
- Coverage summary table (Phase 1: 5 reqs → ~15 reqs) recomputes accordingly.

</deferred>

---

*Phase: 01-vertical-slice-auth-foundation*
*Context gathered: 2026-05-10*
