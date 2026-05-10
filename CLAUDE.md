<!-- GSD:project-start source:PROJECT.md -->
## Project

**Marketing BI**

A Tableau-shaped, internal-only marketing BI dashboard for a single marketing team (4–10 users) that answers attribution and funnel questions off Salesforce data. The product surfaces pre-built dashboards with pivot-style exploration on top — users view and slice, they don't author new visualizations. Hosted on Vercel (frontend + cron), data in Supabase (Postgres + auth), data sourced exclusively from Salesforce.

**Core Value:** **Marketing attribution that Salesforce reports can't answer cleanly:** for every Contact, see the full sequence of campaign touchpoints leading up to lifecycle transitions (MQL → SQL → Opportunity → Customer), then aggregate that into first-touch, last-touch, and multi-touch (linear) credit at both Contact and Account level — including which campaigns/types drove SQLs and Closed Won revenue, and how many touchpoints conversions actually require.

### Constraints

- **Tech stack — Frontend/host:** Vercel — chosen for free hobby tier; serverless functions for API routes; Vercel Cron for the daily Salesforce sync.
- **Tech stack — Backend/data:** Supabase — Postgres for the data warehouse, Supabase Auth for SSO, Supabase row-level security where useful. Free tier targeted; user is willing to upgrade Supabase before Vercel if forced to choose.
- **Tech stack — Data source:** Salesforce REST/Bulk API only. No other ingestion sources for v1.
- **Timeline:** Working v1 in 2–4 weeks. Implies a vertical-MVP slicing approach — ship one end-to-end attribution view fast, layer the rest on top.
- **Team size:** 4–10 internal users. No need to engineer for high concurrency or per-user customization.
- **Data freshness:** Daily refresh is sufficient. No real-time requirement.
- **Platform:** Desktop-primary; pages must be mobile-readable but not mobile-optimized.
- **Budget:** Free tiers preferred end-to-end. Paid tier (Supabase first if needed) acceptable if data volume or function-execution limits force it.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why for *this* project |
|------------|---------|---------|-----------------|
| **Next.js (App Router)** | `16.2.6` | Frontend + API routes + Vercel Cron host | Zero-config Vercel deploy, native cron support, Server Components let chart pages fetch SQL on the server. App Router only — Pages Router is feature-frozen in Next 16. **Confidence: HIGH.** |
| **React** | `19.2.6` | UI runtime | Required by Next 16. |
| **TypeScript** | `6.0.3` | Type safety | Pairs with Drizzle (typed schema) and `supabase gen types`. |
| **Tailwind CSS** | `4.3.0` | Styling | v4 uses Lightning CSS; faster builds, simpler config. |
| **shadcn/ui + Radix** | `shadcn@4.7.0` CLI; `@radix-ui/react-dialog@1.1.15` | Tables, dialogs, dropdowns, command palette | Copy-paste, no runtime lock-in, fits Tableau-dense aesthetic better than MUI. Free. |
| **Supabase** | CLI `2.98.2`; Postgres 15 | Data warehouse + auth + RLS | Free tier (500 MB DB, 50K MAU) easily fits the data volume. Postgres-native = full SQL for attribution. Google OAuth out of the box. |
| **`@supabase/ssr`** | `0.10.3` | Server-side Supabase client for App Router | Replaces deprecated `@supabase/auth-helpers-nextjs`. Required for App Router + Supabase Auth. **HIGH.** |
| **`@supabase/supabase-js`** | `2.105.4` | Browser-side auth + RPC | Heavy reads bypass it and use Drizzle over Supavisor. |
| **Drizzle ORM** | `drizzle-orm@0.45.2` (stay 0.x — 1.0 is `1.0.0-rc.2` not GA as of May 2026) + `drizzle-kit@0.31.10` | Schema, migrations, typed queries | Headless, ~7 KB, zero deps, serverless-friendly. SQL-first — won't fight you on CTEs / window functions for multi-touch attribution. Native materialized-view + `refreshMaterializedView` support. **Pin 0.45.x until 1.0 GA.** **HIGH.** |
| **`postgres` (porsager)** | `3.4.9` | Driver under Drizzle for Supavisor transaction-mode pooling | Officially recommended by Supabase + Drizzle for serverless. Supports `prepare: false` (required by transaction mode). **HIGH.** |
| **`@jsforce/jsforce-node`** | `3.10.14` | Salesforce REST + Bulk + Composite client | Node-only build of jsforce — **2.2 MB unpacked vs `jsforce`'s 34.5 MB** (no `core-js` polyfills, no browser bundle). Same maintainer (Salesforce), same API, same version. Critical for Vercel function size. JWT Bearer Flow + REST `query()` + Bulk v2 + `sobject().updated()` / `.deleted()`. **HIGH.** |
| **Apache ECharts** | `echarts@6.0.0` + `echarts-for-react@3.0.6` | Funnel, Sankey, bar, line, heatmap, treemap | Single library covers **every** chart this project needs — including native **Sankey** (Contact Journey) and **Funnel** (MQL→SQL→Opp→Customer), which Recharts/Tremor lack. Tree-shakeable via `echarts/core`. Apache-2.0. SSR via `renderToSVGString` if needed. **HIGH.** |
| **TanStack Table** | `@tanstack/react-table@8.21.3` | Pivot tables with grouping/aggregation | Headless, supports `getGroupedRowModel` + `aggregationFn: 'sum'/'mean'/'median'`. **Free** — replaces AG Grid Enterprise pivot license. **HIGH.** |
| **TanStack Query** | `@tanstack/react-query@5.100.9` | Client-side cache for filter changes | Server Components do initial fetch, Query handles client-driven filter changes. |
### Supporting Libraries
| Library | Version | Purpose |
|---------|---------|---------|
| `zod` | `4.4.3` | Runtime validation of SF responses + form inputs |
| `date-fns` | `4.1.0` | Lifecycle stage windows / attribution date math |
| `lucide-react` | `1.14.0` | Icons (shadcn standard) |
| `jsonwebtoken` | `9.x` | Sign JWTs for Salesforce JWT Bearer Flow |
| `eslint` + `eslint-config-next` | `10.3.0` | Linting |
| `vitest` | `4.1.5` | Unit-test attribution logic as pure functions |
| `pino` | latest | Structured cron logs |
### Development Tools
| Tool | Notes |
|------|-------|
| `supabase` CLI `2.98.2` | `supabase start` for local stack, `supabase db diff` for migrations, `supabase gen types typescript --local` after every migration |
| `drizzle-kit` | Drizzle owns schema (single source of truth); generated SQL applied via Supabase migrations in CI |
| Vercel CLI | `vercel dev` only if you need full runtime semantics; `next dev` is faster |
| Supabase Branching | Per-branch DBs for Vercel previews. Free on Pro ($25/mo); on Free tier, share one "dev" Supabase project across previews |
## Installation
# Core
# Styling + UI
# Supabase + Postgres driver
# ORM
# Salesforce
# Charts + tables
# Misc
## Per-Question Recommendations
### 1. Frontend framework — Next.js 16 App Router (HIGH)
- **App Router**, not Pages Router (Pages is feature-frozen).
- **Server Components** for chart pages: SQL runs on the server, JSON to browser is small, no client-side Supabase round-trip on first paint.
- **Client Components** only for interactive bits: filters, the pivot table's expand/collapse, ECharts canvas.
- **Node runtime** (`export const runtime = 'nodejs'`) for everything that touches Supabase or Salesforce. **`@jsforce/jsforce-node` and `postgres` will not run on Edge** — Edge buys nothing for a 4–10-person internal tool anyway.
- **Vercel Cron** declared in `vercel.json` calling `/api/cron/sync-salesforce`. Set `export const maxDuration = 60` (Hobby) or `300` (Pro). For 15K Contacts incremental sync this is comfortably enough; run the initial backfill (hundreds of K Campaign Members) once locally, not from cron.
### 2. Charting — ECharts as the single tool (HIGH)
| Need | ECharts | Recharts | Tremor | Visx | AG Grid | Plotly |
|------|---------|----------|--------|------|---------|--------|
| Funnel native | ✅ | ❌ | ❌ | ⚠ DIY | n/a | ✅ |
| Sankey native | ✅ | ⚠ basic | ❌ | ⚠ DIY | n/a | ✅ |
| Pivot table | n/a | n/a | n/a | n/a | ✅ (Enterprise $$) | n/a |
| Pro/dense aesthetic | ✅ | ⚠ playful | ⚠ shadcn-y | ✅ | ✅ | ⚠ scientific |
| Bundle (tree-shake) | ✅ | ✅ | ✅ | ✅ | 🔴 | 🔴 huge |
| License | Apache-2.0 | MIT | Apache-2.0 | MIT | **Enterprise needed for pivot** | MIT |
- **Use ECharts via `echarts-for-react`** — always import via `echarts/core` and register only what you use (`SankeyChart`, `FunnelChart`, `BarChart`, `LineChart`, `HeatmapChart`, plus `Tooltip/Legend/Grid` components, `CanvasRenderer`). Keeps bundle ~300 KB gzipped.
- **TanStack Table** for pivot tables — `getGroupedRowModel` + `aggregationFn` covers the spec for $0.
- **Server-render data, client-render the chart.** Server Component fetches aggregated rows; passes as props to a Client Component that mounts ECharts.
- **AG Grid Enterprise** — pivot is paywalled; non-starter for a cost-sensitive build.
- **Tremor** — last stable Jan 2025 (3.18.7), v4 abandoned in beta. Effectively unmaintained. Use as design inspiration only.
- **Apache Superset embedded** — Python service + Redis + meta-DB + iframe; massive overkill for 5 dashboards.
- **Plotly.js** — bundle >3 MB, commercial paths push to paid Dash.
- **Visx** — primitive toolkit, not a chart library; Sankey/Funnel from `@visx/shape` will eat days.
- **Recharts for Sankey** — has one but it's underdeveloped; not worth a multi-library setup.
### 3. Salesforce client — `@jsforce/jsforce-node` 3.10.14 + JWT Bearer Flow (HIGH)
- **Package: `@jsforce/jsforce-node`, NOT `jsforce`.** Same maintainer (Salesforce / jsforce GitHub org), same API, same version (3.10.14). The difference: Node-only build, **2.2 MB unpacked vs 34.5 MB** for plain `jsforce` (which bundles `core-js` polyfills + browser build you'll never use). On Vercel serverless, that 30 MB matters — function size, cold-start, install speed.
- **Auth: OAuth 2.0 JWT Bearer Flow** — `grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer'`. Server-to-server, no human-in-the-loop, no refresh-token rotation. Sign a fresh 3-minute JWT each cron run with a private key in Vercel env vars + a Connected App with self-signed cert in Salesforce. jsforce supports it natively via `conn.authorize({ grant_type: '...', assertion: signedJwt })`.
- **Sync strategy:**
- **Field selection:** `describe()` once, cache, then explicitly select. No wildcard fetches (SOQL governor).
### 4. Supabase configuration
#### Postgres extensions
| Extension | Decision | Why |
|-----------|----------|-----|
| `pg_stat_statements` | **Enable.** | Free, near-zero overhead; finds slow attribution queries when one blows up. |
| `pg_cron` | **Enable.** | Schedule materialized-view `REFRESH` from inside Postgres. Belt-and-braces with Vercel Cron: Vercel Cron does the SF→Postgres pull; `pg_cron` does the post-load rollup refresh. |
| `pgcrypto` | Already enabled. | `gen_random_uuid()` for surrogate keys. |
| `pg_partman` | **Skip.** | For multi-million-row time-partitioned tables. Hundreds of K rows don't need partitioning. Revisit at >10M rows. |
| `timescaledb` | **Skip.** | Not natively on Supabase managed Postgres; daily-grain BI doesn't need hypertables. |
| `pgvector` | **Skip.** | No semantic/AI in v1 (out of scope). |
#### RLS strategy — be honest about what you actually have
- **You have one team, one role, one shared dataset. RLS does not buy data isolation between users — there's nothing to isolate.**
- **Recommended posture: auth gating, NOT RLS for tenant isolation.** Specifically:
- **Revisit RLS** the first time a real "user X can see Y but not Z" rule shows up. Today it doesn't.
#### Materialized views vs `pg_cron` vs application cache
#### Connection pooling — Supavisor transaction mode (HIGH)
- **Always connect via Supavisor**, never directly. Vercel serverless creates/tears down connections fast; only the pooler absorbs that.
- **Transaction mode (port 6543)**, not session mode (5432).
- `connection_limit=1` per function invocation; `prepare: false` (transaction mode does not support prepared statements).
- Drizzle setup:
### 5. ORM / query layer — Drizzle 0.45.x + raw SQL escape hatch (HIGH)
- **Drizzle vs Prisma:** Prisma's query engine is a Rust binary — heavy cold-starts, big footprint on serverless. Prisma's relational API can't always express the window functions and CTEs needed for multi-touch attribution; you'd end up using `prisma.$queryRaw` *anyway*.
- **Drizzle vs Kysely:** Kysely is excellent and arguably more SQL-faithful, but Drizzle has built-in **migrations** (`drizzle-kit`) and **materialized view** primitives. Kysely makes you bring your own migration tool.
- **Drizzle vs raw `pg`:** You want migrations and schema types. Raw `pg` is fine for one-off scripts; not a foundation.
- **Pattern:**
- **`supabase.rpc()` for SQL functions:** Yes — use it to expose typed analytics functions to the client when needed (e.g., `get_campaign_contribution_to_sqls(date_from, date_to)`). Server-side analytics use Drizzle directly.
### 6. Auth — Supabase Auth + Google OAuth + custom shadcn login (HIGH for OAuth, MEDIUM-HIGH for domain-allowlist trigger pattern)
- **Provider config:** Supabase dashboard → Authentication → Providers → Google. Add `hd=orca-ai.io` via `signInWithOAuth({ provider: 'google', options: { queryParams: { hd: 'orca-ai.io' } } })`.
- **Server-side domain enforcement** (because `hd` is spoofable client-side): Supabase Auth Hook OR a database trigger on `auth.users`:
- **Email + password fallback:** Enable in providers, email confirmation required, but don't advertise unless OAuth setup hits a snag.
- **Sign-in UI: custom, not Supabase Auth UI.** `@supabase/auth-ui-react` is in maintenance mode and looks like a generic SaaS form. Hand-roll a one-page sign-in with shadcn `<Button>` + `signInWithOAuth` — ~30 lines, matches your design system.
- **NextAuth (Auth.js)? NO.** NextAuth + Supabase = two session systems = known footgun. Supabase Auth covers everything (Google, email/password, magic link, RLS-aware JWTs).
### 7. Local dev / CI / preview deploys
- **Local Supabase stack:** `supabase start` boots Postgres + GoTrue + Studio + Realtime in Docker. Develop entirely against `localhost:54321`.
- **Seeding with anonymized SF fixtures:** Two viable patterns —
- **Type generation:** `supabase gen types typescript --local > types/supabase.ts` after every migration. Wire to `pnpm types` script + run in CI to fail builds on stale types. Run `drizzle-kit generate` separately for Drizzle types.
- **Preview deploys:**
- **CI:** GitHub Actions, two jobs — `lint + typecheck + vitest` on every PR; `supabase db push --linked` on merge to `main` after `vercel deploy`.
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Next.js App Router | Remix / SvelteKit | If team had pre-existing Remix/Svelte expertise. None implied. |
| ECharts | Recharts + AG Grid Community + custom Sankey | If you didn't need Sankey at all. You do. |
| ECharts | Visx + D3 | If you wanted full visual control and had 2× timeline. |
| TanStack Table | AG Grid Community | If you don't need pivoting (Community lacks it). |
| TanStack Table | AG Grid **Enterprise** | If pivot must be drag-and-drop reorderable by users *and* budget tolerates ~$1K+/dev/year. Spec doesn't require it. |
| `@jsforce/jsforce-node` | Salesforce CLI shelled from Node | One-off scripts only. |
| `@jsforce/jsforce-node` | Direct REST with `fetch` | If jsforce ever blocks you. At this scale, jsforce covers everything. |
| Drizzle | Prisma | A Rails-like CRUD app. This is the reverse — analytics-heavy. |
| Drizzle | Kysely | If you actively dislike schema-as-code. Kysely is great; just adds a migration-tool decision. |
| Supabase Auth | Clerk / WorkOS / Auth0 | If multi-org SSO became a hard requirement. Spec rules it out. |
| Materialized views | Application cache (Redis / Vercel KV) | If freshness needed sub-minute. Daily refresh = matviews are perfect. |
## What NOT to Use (one-line summary)
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@tremor/react`** | Last stable Jan 2025; v4 abandoned in beta. Adopting in 2026 is a dead-end. | shadcn/ui + ECharts |
| **AG Grid Enterprise** | Pivot is paywalled. | TanStack Table `getGroupedRowModel` |
| **Apache Superset embedded** | Python + Redis + meta-DB + iframe; total architecture mismatch. | Build the 5 dashboards directly in Next.js |
| **Plotly.js** | >3 MB bundle; commercial paths push to paid Dash. | ECharts (smaller, broader catalog, Apache-2.0) |
| **Pages Router** | Feature-frozen; new Next features are App-Router-only. | App Router |
| **Edge runtime** for DB/SF code | `@jsforce/jsforce-node` and `postgres` need Node APIs. | `runtime = 'nodejs'` |
| **Direct Postgres** (port 5432) from Vercel | Will exhaust connections. | Supavisor transaction mode (6543) |
| **Prisma** | Heavy runtime, weak on analytical SQL. | Drizzle |
| **Plain `jsforce`** | 34.5 MB unpacked vs 2.2 MB; ships browser polyfills. | `@jsforce/jsforce-node` |
| **`@supabase/auth-helpers-nextjs`** | Deprecated. | `@supabase/ssr` |
| **NextAuth + Supabase together** | Two session systems = footgun. | Supabase Auth alone |
| **GraphQL / Apollo** | One-client / one-team — schema layer earns nothing. | Server Components + Drizzle + a few `supabase.rpc()` |
| **TimescaleDB / pg_partman in v1** | Solves problems you don't have at hundreds of K rows. | Plain Postgres with proper indexes |
| **Real-time subscriptions** for dashboards | Daily refresh is the spec; subscriptions add complexity for nothing. | Refetch on page load + TanStack Query staleTime |
| **Username + password + security token** for SF | Deprecated, brittle. | OAuth JWT Bearer Flow |
| **Fivetran / Airbyte / Stitch** | Monthly cost > rest of stack. | Hand-rolled `@jsforce/jsforce-node` cron |
## Stack Patterns by Variant
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `next@16.x` | `react@19.x` | React 19 required by Next 16. |
| `@supabase/ssr@0.10.x` | `@supabase/supabase-js@2.105.x` | Pin major. |
| `drizzle-orm@0.45.x` | `drizzle-kit@0.31.x`, `postgres@3.4.x` | **Stay on 0.45.x — `1.0.0-rc.2` not GA as of May 2026.** |
| `echarts@6.0.0` | `echarts-for-react@3.0.6` | Wrapper supports v5/v6; v6 current. |
| `@tanstack/react-table@8.x` | React 18/19 | v9 in development; v8 is the production pick. |
| `@jsforce/jsforce-node@3.10.x` | Node 20+ | Vercel default Node 20 is fine. |
| Tailwind `4.3.x` | PostCSS via `@tailwindcss/postcss` | v4 dropped JS config in favor of `@theme` in CSS. |
## Confidence Assessment
| Recommendation | Confidence | Basis |
|----------------|------------|-------|
| Next.js 16 App Router on Vercel, Node runtime | **HIGH** | Verified via Next.js docs (Context7); `runtime = 'nodejs'` documented; Pages Router maintenance status verified. |
| Supabase + Supavisor transaction mode + `prepare: false` + `connection_limit=1` | **HIGH** | Verified via Supabase docs (Context7) — explicit recommendation for serverless. |
| Drizzle 0.45.x (not 1.0 RC) + `postgres` driver | **HIGH** | npm registry confirms 1.0 still RC as of May 2026. |
| `@jsforce/jsforce-node` over `jsforce` for serverless | **HIGH** | npm registry: same maintainer + same version + 2.2 MB vs 34.5 MB. JWT bearer flow verified in jsforce docs. |
| ECharts 6 for all charts incl. Sankey/Funnel | **HIGH** | ECharts docs verified for `series.sankey`/`series.funnel` + tree-shaking via `echarts/core`. |
| TanStack Table for pivot/group/aggregation | **HIGH** | Docs verified for `getGroupedRowModel` + `aggregationFn`. |
| Materialized views + `pg_cron` post-sync refresh | **HIGH** | Supabase docs verified; `refresh materialized view concurrently` is standard Postgres. |
| RLS minimal posture (auth gate only, single team) | **HIGH** | Supabase explicit guidance — the documented "single tenant" pattern. |
| Supabase Auth + Google OAuth `hd=` + server-side domain trigger | **MEDIUM-HIGH** | OAuth flow verified; `hd` spoofability + server-side enforcement is industry practice; the SQL trigger shape should be sanity-checked against current Supabase Auth Hooks API before merging. |
| Drop Tremor as a dependency | **HIGH** | npm registry: last stable Jan 2025, v4 abandoned in beta. |
| Drop AG Grid Enterprise | **HIGH** | Pivot license requirement is documented; cost trade-off is project policy. |
## Open Questions / Gaps
- **Salesforce API call budget:** Verify Salesforce Edition's daily API call quota (Enterprise: 100K/day, more than enough; Professional: 15K/day, tighter) before committing to incremental-sync-every-day-from-cron.
- **Initial backfill volume:** "Hundreds of thousands" of Campaign Members fits Bulk v2 in one shot, but should be benchmarked. If it overflows free-tier 500 MB DB once Opportunities + OCR + Presentations are also loaded, plan for Supabase Pro ($25/mo, 8 GB DB) earlier than expected.
- **Supabase Branching availability:** Branching now requires Pro plan; on Free tier, share one dev project across previews — confirm cadence before locking in.
- **Custom domain enforcement in Supabase Auth:** Native "allowed email domains" config has been graduating from beta; check whether the trigger pattern can be replaced with a config-only setup at v1 build time.
## Sources
- **Context7: `/vercel/next.js`** — App Router, Route Handlers, `runtime = 'nodejs'`, `maxDuration`, edge runtime deprecation status.
- **Context7: `/supabase/supabase`** — Supavisor transaction mode (port 6543), `prepare: false`, `connection_limit=1`, materialized views, `pg_cron`, `pg_stat_statements`, `pg_partman`, RLS policies, Supabase Branching + Vercel preview integration.
- **Context7: `/supabase/ssr`** — `createServerClient` patterns for App Router middleware / Server Components / Route Handlers.
- **Context7: `/supabase/auth`** — Google OAuth provider config, `signInWithOAuth`, JWT app metadata for RLS.
- **Context7: `/jsforce/jsforce.github.io`** — JWT Bearer Flow auth, Bulk API v2, REST `query()`, `sobject().updated()` / `.deleted()` for incremental sync, schema type generation.
- **Context7: `/drizzle-team/drizzle-orm-docs`** — Materialized view definition + refresh, postgres-js driver setup, Supabase patterns.
- **Context7: `/apache/echarts-doc`** — `series.funnel`, `series.sankey`, tree-shaking with `echarts/core` + `echarts.use()`, SSR via `renderToSVGString`.
- **Context7: `/websites/tanstack_table`** — `getGroupedRowModel`, `aggregationFn`, grouping examples.
- **npm registry (May 2026)** — Confirmed current versions: Next 16.2.6, React 19.2.6, Drizzle 0.45.2 (1.0.0-rc.2 in RC), ECharts 6.0.0, `@jsforce/jsforce-node` 3.10.14 (vs `jsforce` 3.10.14 — same maintainer, same version, different bundle: 2.2 MB vs 34.5 MB unpacked), Tremor's last stable 3.18.7 from Jan 2025 confirms unmaintained status.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
