# Stack Research: Marketing-Attribution BI Dashboard on Vercel + Supabase + Salesforce

**Domain:** Internal marketing-attribution BI dashboard (Tableau-shaped) on Vercel + Supabase, daily Salesforce ingestion, 4–10 users, ~5K Accounts / ~15K Contacts / ~100Ks Campaign Members, 2–4 week v1
**Researched:** 2026-05-10
**Overall Confidence:** HIGH

> Decision lens used everywhere: **(a) free-tier-first, (b) ship vertical slice in 2–4 weeks, (c) optimise for SQL-heavy reads on Postgres, (d) one team / one role / one org / desktop-primary.** When two options were close, the simpler / smaller-footprint / Postgres-native one wins.

---

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

---

## Installation

```bash
# Core
npm install next@16.2.6 react@19.2.6 react-dom@19.2.6
npm install -D typescript@6.0.3 @types/node@25.6.2 @types/react@19 @types/react-dom@19

# Styling + UI
npm install tailwindcss@4.3.0 @tailwindcss/postcss
npx shadcn@latest init
npm install lucide-react@1.14.0

# Supabase + Postgres driver
npm install @supabase/ssr@0.10.3 @supabase/supabase-js@2.105.4 postgres@3.4.9

# ORM
npm install drizzle-orm@0.45.2
npm install -D drizzle-kit@0.31.10

# Salesforce
npm install @jsforce/jsforce-node@3.10.14 jsonwebtoken@9

# Charts + tables
npm install echarts@6.0.0 echarts-for-react@3.0.6 @tanstack/react-table@8.21.3 @tanstack/react-query@5.100.9

# Misc
npm install zod@4.4.3 date-fns@4.1.0 pino
npm install -D eslint@10.3.0 eslint-config-next vitest@4.1.5 supabase@2.98.2
```

---

## Per-Question Recommendations

### 1. Frontend framework — Next.js 16 App Router (HIGH)

- **App Router**, not Pages Router (Pages is feature-frozen).
- **Server Components** for chart pages: SQL runs on the server, JSON to browser is small, no client-side Supabase round-trip on first paint.
- **Client Components** only for interactive bits: filters, the pivot table's expand/collapse, ECharts canvas.
- **Node runtime** (`export const runtime = 'nodejs'`) for everything that touches Supabase or Salesforce. **`@jsforce/jsforce-node` and `postgres` will not run on Edge** — Edge buys nothing for a 4–10-person internal tool anyway.
- **Vercel Cron** declared in `vercel.json` calling `/api/cron/sync-salesforce`. Set `export const maxDuration = 60` (Hobby) or `300` (Pro). For 15K Contacts incremental sync this is comfortably enough; run the initial backfill (hundreds of K Campaign Members) once locally, not from cron.

**Do NOT use:** Remix/SvelteKit (every Supabase + Vercel example assumes Next; you can't afford the deviation cost on a 2–4 week budget); Pages Router; Edge runtime for DB/SF code.

### 2. Charting — ECharts as the single tool (HIGH)

The killer requirements are **Sankey** (Contact Journey) and **Funnel** (MQL→SQL→Opp→Customer). ECharts is the only free library with both as first-class chart types.

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

**Do NOT use:**
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
  - **Initial backfill (one-off, run from your laptop):** Bulk API v2 (`conn.bulk2.query()`) for Contacts, Accounts, Campaign Members, Opportunities, OCR, `Presentation__c`. Don't run from cron.
  - **Daily incremental (cron):** REST `query()` with `WHERE SystemModstamp > :lastSyncTimestamp` per object. Track `lastSyncTimestamp` per object in a `sync_state` table.
  - **Deletions:** `conn.sobject(name).deleted(start, end)` (calls SF's `getDeleted`).
  - **Composite API** for batched lookups when needed; avoid prematurely.
- **Field selection:** `describe()` once, cache, then explicitly select. No wildcard fetches (SOQL governor).

**Do NOT use:** plain `jsforce` (size); username+password+security token (deprecated); standard OAuth web flow with refresh tokens (stateful — wrong for cron); CDC/Streaming/Pub-Sub (always-on, doesn't fit serverless cron); Fivetran/Airbyte/Stitch (cost > rest of stack).

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
  - Enable RLS on every table (`alter table ... enable row level security`) — Supabase warns loudly otherwise.
  - One policy per table: `create policy "team_read" on <table> for select to authenticated using (true);` (and similar for service_role).
  - Block anon explicitly. Service role key (only used by the cron Route Handler) bypasses RLS — fine, it's server-side.
  - Add domain enforcement in Google OAuth (`hd=orca-ai.io`) **plus** a server-side allowlist in a Supabase Auth hook, since `hd` alone is spoofable on the client.
- **Revisit RLS** the first time a real "user X can see Y but not Z" rule shows up. Today it doesn't.

#### Materialized views vs `pg_cron` vs application cache

**Use materialized views, refreshed by `pg_cron` right after the SF sync writes its last row.**

1. Cron route writes raw SF data into `sf_*` tables.
2. As the last step, cron route calls `refresh materialized view concurrently <name>;` (or triggers a `pg_cron` job).
3. Matviews compute the expensive joins/aggregations:
   - `mv_first_touch_attribution_contact`
   - `mv_last_touch_attribution_contact`
   - `mv_linear_touch_attribution_contact_campaign`
   - `mv_account_engagement_rollup`
   - `mv_funnel_transitions_daily`
4. Page-load queries hit only matviews — sub-100 ms even on free tier compute.

**Why this beats application cache:** data is daily-grain anyway; in-memory caches in serverless are cold every invocation; matviews give cache + auditability + cheap re-computation in one move.

#### Connection pooling — Supavisor transaction mode (HIGH)

- **Always connect via Supavisor**, never directly. Vercel serverless creates/tears down connections fast; only the pooler absorbs that.
- **Transaction mode (port 6543)**, not session mode (5432).
- `connection_limit=1` per function invocation; `prepare: false` (transaction mode does not support prepared statements).
- Drizzle setup:
  ```ts
  import postgres from 'postgres';
  import { drizzle } from 'drizzle-orm/postgres-js';
  const client = postgres(process.env.DATABASE_URL_POOLED!, { prepare: false, max: 1 });
  export const db = drizzle(client);
  ```

### 5. ORM / query layer — Drizzle 0.45.x + raw SQL escape hatch (HIGH)

- **Drizzle vs Prisma:** Prisma's query engine is a Rust binary — heavy cold-starts, big footprint on serverless. Prisma's relational API can't always express the window functions and CTEs needed for multi-touch attribution; you'd end up using `prisma.$queryRaw` *anyway*.
- **Drizzle vs Kysely:** Kysely is excellent and arguably more SQL-faithful, but Drizzle has built-in **migrations** (`drizzle-kit`) and **materialized view** primitives. Kysely makes you bring your own migration tool.
- **Drizzle vs raw `pg`:** You want migrations and schema types. Raw `pg` is fine for one-off scripts; not a foundation.
- **Pattern:**
  - Drizzle owns the schema (`schema.ts`).
  - `drizzle-kit generate` produces migrations; Supabase CLI applies them in CI (Supabase's migration history stays the source of truth for the DB).
  - Heavy attribution queries live in `*.sql` files invoked via `db.execute(sql\`...\`)` or as Postgres functions called via `supabase.rpc()`.
  - `supabase gen types typescript` → types for `supabase-js` consumers (auth client). Drizzle types cover the analytics path.
- **`supabase.rpc()` for SQL functions:** Yes — use it to expose typed analytics functions to the client when needed (e.g., `get_campaign_contribution_to_sqls(date_from, date_to)`). Server-side analytics use Drizzle directly.

**Do NOT use:** Prisma (heavy cold-start, weak on analytical SQL); Apollo/GraphQL/PostgREST as the query layer (overkill for one-client / one-team — schema layer earns nothing); raw `pg` as foundation.

### 6. Auth — Supabase Auth + Google OAuth + custom shadcn login (HIGH for OAuth, MEDIUM-HIGH for domain-allowlist trigger pattern)

- **Provider config:** Supabase dashboard → Authentication → Providers → Google. Add `hd=orca-ai.io` via `signInWithOAuth({ provider: 'google', options: { queryParams: { hd: 'orca-ai.io' } } })`.
- **Server-side domain enforcement** (because `hd` is spoofable client-side): Supabase Auth Hook OR a database trigger on `auth.users`:
  ```sql
  create function auth.enforce_domain_allowlist()
  returns trigger as $$
  begin
    if split_part(new.email, '@', 2) <> 'orca-ai.io' then
      raise exception 'Domain not allowed';
    end if;
    return new;
  end; $$ language plpgsql security definer;
  ```
  (Verify trigger shape before merging — pattern is correct; Supabase has been adding native "allowed_domains" config too, check current docs.)
- **Email + password fallback:** Enable in providers, email confirmation required, but don't advertise unless OAuth setup hits a snag.
- **Sign-in UI: custom, not Supabase Auth UI.** `@supabase/auth-ui-react` is in maintenance mode and looks like a generic SaaS form. Hand-roll a one-page sign-in with shadcn `<Button>` + `signInWithOAuth` — ~30 lines, matches your design system.
- **NextAuth (Auth.js)? NO.** NextAuth + Supabase = two session systems = known footgun. Supabase Auth covers everything (Google, email/password, magic link, RLS-aware JWTs).

**Free vs paid:** Supabase free tier includes 50K MAU + unlimited Google OAuth. You will not pay for auth at this team size.

### 7. Local dev / CI / preview deploys

- **Local Supabase stack:** `supabase start` boots Postgres + GoTrue + Studio + Realtime in Docker. Develop entirely against `localhost:54321`.
- **Seeding with anonymized SF fixtures:** Two viable patterns —
  1. `supabase/seed.sql` with hand-written/generated rows (~50 contacts, ~10 campaigns). Fastest.
  2. Run the cron locally once against an SF sandbox and dump tables for seed. Most realistic; use for end-to-end attribution testing.
- **Type generation:** `supabase gen types typescript --local > types/supabase.ts` after every migration. Wire to `pnpm types` script + run in CI to fail builds on stale types. Run `drizzle-kit generate` separately for Drizzle types.
- **Preview deploys:**
  - **Free tier:** point all PR previews at one shared "dev" Supabase project. Override `SUPABASE_URL`/`SUPABASE_ANON_KEY` for non-prod branches in Vercel.
  - **Pro ($25/mo):** Supabase Branching + Vercel integration auto-injects per-branch DB credentials. Worth $25 the moment a second contributor lands. Constraints note "willing to upgrade Supabase first" — do this *before* the second contributor.
- **CI:** GitHub Actions, two jobs — `lint + typecheck + vitest` on every PR; `supabase db push --linked` on merge to `main` after `vercel deploy`.

---

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

---

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

---

## Stack Patterns by Variant

**If a chart needs sub-daily freshness later:** Move that single matview's refresh to `*/15 * * * *` via `pg_cron`; keep raw `sf_*` tables on daily. Don't move to SF Streaming API unless real-time is required.

**If team grows past 10 users with per-role data scoping:** Adopt RLS properly — add `user_role` and `account_team` tables, write per-table policies. Consider Supabase Pro.

**If daily SF sync hits Vercel Hobby's 60s timeout:** Upgrade to Pro (`maxDuration=300`); or split the cron (Contacts at 02:00, Campaign Members at 02:10, Opportunities at 02:20). Don't add a worker service unless the split also fails.

**If `Presentation__c` stops being the SQL trigger:** All ingestion is centralized in `lib/salesforce/sync.ts` — change there, regenerate types, redeploy. No DB migration unless lifecycle stage timing changes.

---

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

---

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

---

## Open Questions / Gaps

- **Salesforce API call budget:** Verify Salesforce Edition's daily API call quota (Enterprise: 100K/day, more than enough; Professional: 15K/day, tighter) before committing to incremental-sync-every-day-from-cron.
- **Initial backfill volume:** "Hundreds of thousands" of Campaign Members fits Bulk v2 in one shot, but should be benchmarked. If it overflows free-tier 500 MB DB once Opportunities + OCR + Presentations are also loaded, plan for Supabase Pro ($25/mo, 8 GB DB) earlier than expected.
- **Supabase Branching availability:** Branching now requires Pro plan; on Free tier, share one dev project across previews — confirm cadence before locking in.
- **Custom domain enforcement in Supabase Auth:** Native "allowed email domains" config has been graduating from beta; check whether the trigger pattern can be replaced with a config-only setup at v1 build time.

---

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
