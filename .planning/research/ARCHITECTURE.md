# Architecture Research

**Domain:** Salesforce-sourced marketing-attribution BI dashboard (Vercel + Supabase, internal tool, daily refresh)
**Researched:** 2026-05-10
**Confidence:** HIGH on platform mechanics (Vercel cron limits, Supabase RLS / pg_cron, jsforce Bulk 2.0 — verified via Context7); MEDIUM on the dbt-vs-matview opinion and exact attribution SQL (canonical patterns, not version-specific).

---

## Standard Architecture

### System Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                         BROWSER (4–10 users)                        │
│  Next.js App Router pages, Server Components                        │
│  supabase-js (anon key) — auth session only                         │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS (cookie-bound session)
┌──────────────────────────────▼─────────────────────────────────────┐
│                          VERCEL                                     │
│  ┌──────────────────────────┐  ┌──────────────────────────────┐    │
│  │ App Router routes        │  │ Vercel Cron                   │    │
│  │ /app/(dashboard)/...     │  │ schedule: "0 6 * * *"         │    │
│  │ Server Components +      │  │ → /api/cron/sync              │    │
│  │ Route Handlers           │  │ (serverless fn, maxDuration)  │    │
│  └──────────┬───────────────┘  └──────────────┬───────────────┘    │
│             │ supabase-js                      │ jsforce + supabase│
│             │ (server, anon + user JWT for     │ (service-role)    │
│             │  read-marts)                     │                   │
└─────────────┼──────────────────────────────────┼───────────────────┘
              │                                  │
              │                                  │ Bulk API 2.0
              │                                  ▼
              │                  ┌──────────────────────────────┐
              │                  │      SALESFORCE              │
              │                  │  Contact, Account, Campaign, │
              │                  │  CampaignMember, Opportunity,│
              │                  │  OpportunityContactRole,     │
              │                  │  Presentation__c             │
              │                  └──────────────────────────────┘
              ▼
┌────────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Postgres                                                     │  │
│  │  ┌──────────┐   ┌────────────┐   ┌──────────────────────┐    │  │
│  │  │ raw.*    │──▶│ stage.*    │──▶│ mart.* (materialized)│    │  │
│  │  │ sf_*     │   │ cleaned,   │   │ touchpoints,         │    │  │
│  │  │ tables   │   │ typed      │   │ attribution_contact, │    │  │
│  │  │          │   │ views      │   │ attribution_account, │    │  │
│  │  │          │   │            │   │ funnel_snapshots     │    │  │
│  │  └──────────┘   └────────────┘   └──────────────────────┘    │  │
│  │                                                              │  │
│  │  ops.sync_runs   (run history, status, watermarks)           │  │
│  │  ops.sync_errors (per-object error log)                      │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Supabase Auth — Google SSO + email/password fallback         │  │
│  │ Domain allowlist enforced in DB trigger on auth.users insert │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Vercel Cron** | Trigger daily sync at fixed time | `vercel.json` crons → POST to `/api/cron/sync`. Hobby plan: 1×/day max, ~300s default function timeout, dispatched within the specified hour. |
| **Sync orchestrator** (`/api/cron/sync`) | Read watermarks, submit Bulk 2.0 jobs, ingest CSV, upsert, update watermarks, log run | Serverless Node fn using `jsforce` + `@supabase/supabase-js` with the service role |
| **Salesforce Bulk API 2.0** | Bulk export of incremental rows since watermark | jsforce `conn.bulk2.query()` with `WHERE LastModifiedDate >= :watermark`; streams CSV, jsforce manages job submit/poll |
| **`raw.*` tables** | 1:1 mirror of SF objects, every column we need | Real tables keyed on SF Id (text PK), ingested via `INSERT … ON CONFLICT DO UPDATE` |
| **`stage.*` views** | Light cleanup, typed columns, computed flags | Plain SQL views over `raw.*` (cheap; defer materialization) |
| **`mart.*` materialized views** | Touchpoint fact, per-Contact attribution, Account rollup, funnel metrics | `REFRESH MATERIALIZED VIEW CONCURRENTLY` at end of sync run |
| **Next.js Server Components** | Render dashboards by querying `mart.*` directly | `supabase-js` server client; results rendered in RSC |
| **Next.js Route Handlers** | CSV/PDF export, the cron entrypoint | Only used where RSC can't (POST endpoints, exports) |
| **Supabase Auth** | Google SSO, session cookies, email allowlist | Supabase Auth + custom DB trigger blocking non-allowlisted domains |
| **`ops.sync_runs`** | Source of truth for sync health (last-run, duration, row counts, error) | Postgres table written by orchestrator, read by `/admin/sync` |

---

## Recommended Project Structure

```
.
├── app/                              # Next.js App Router
│   ├── (dashboard)/                  # Auth-gated dashboard layout
│   │   ├── layout.tsx                # Auth gate + nav
│   │   ├── campaigns/page.tsx        # Campaign Contribution to SQLs
│   │   ├── journey/page.tsx          # Contact Journey
│   │   ├── accounts/page.tsx         # Account-Level Attribution
│   │   ├── revenue/page.tsx          # Revenue & Closed Won
│   │   └── depth/page.tsx            # Touchpoint Depth Analysis
│   ├── (auth)/login/page.tsx         # Google SSO + fallback
│   ├── admin/sync/page.tsx           # Sync run history (internal)
│   └── api/
│       ├── cron/sync/route.ts        # Daily sync entrypoint (Vercel Cron)
│       └── export/route.ts           # CSV export
│
├── lib/
│   ├── sync/                         # ETL orchestrator
│   │   ├── orchestrator.ts           # Run order, watermark, error capture
│   │   ├── salesforce.ts             # jsforce client factory + auth
│   │   ├── extract.ts                # Bulk 2.0 incremental queries per object
│   │   ├── load.ts                   # Upsert into raw.* via supabase
│   │   ├── refresh.ts                # REFRESH MATERIALIZED VIEW marts
│   │   └── soql.ts                   # Per-object SELECT field lists
│   ├── supabase/
│   │   ├── server.ts                 # Server client (anon, RLS-on)
│   │   ├── service.ts                # Service-role client (cron only)
│   │   └── browser.ts                # Browser client (auth UI only)
│   ├── attribution/                  # Pure TS for tests; mirrors SQL marts
│   │   ├── linear.ts                 # Linear multi-touch reference impl
│   │   └── types.ts
│   └── filters/                      # URL ↔ query state
│       ├── encode.ts                 # filter → searchParams
│       └── parse.ts                  # searchParams → typed filter
│
├── supabase/
│   ├── migrations/                   # SQL migrations (timestamped)
│   │   ├── 0001_raw_tables.sql       # raw.sf_account, sf_contact, etc.
│   │   ├── 0002_ops_tables.sql       # ops.sync_runs, ops.sync_errors
│   │   ├── 0003_stage_views.sql      # stage.* views
│   │   ├── 0004_mart_touchpoints.sql # mart.touchpoints (matview)
│   │   ├── 0005_mart_attribution.sql # mart.attribution_contact / _account
│   │   ├── 0006_auth_allowlist.sql   # auth domain trigger
│   │   └── 0007_rls_policies.sql     # RLS on mart.* (defense-in-depth)
│   └── seed.sql                      # Optional dev fixtures
│
├── components/
│   ├── charts/                       # Recharts/Tremor wrappers
│   ├── filters/                      # Shareable URL-state filter UI
│   └── ui/                           # shadcn primitives
│
├── vercel.json                       # crons + maxDuration config
└── .planning/                        # GSD planning artifacts
```

### Structure Rationale

- **`app/(dashboard)/` route group** — every dashboard shares an auth-gated layout without affecting URLs. Each page is a Server Component that queries `mart.*` directly; no API tier needed for reads.
- **`app/api/cron/sync/route.ts`** — the ETL is a single Route Handler invoked by Vercel Cron. Keeps everything inside one deployable; honors the "no extra services" constraint.
- **`lib/sync/`** — isolates ETL from UI. UI never imports from here. Orchestrator is unit-testable in pure Node.
- **`lib/attribution/`** — TypeScript reference implementation of the linear-attribution math. Used for unit tests against fixtures. SQL is the production source of truth; TS is the spec.
- **`supabase/migrations/`** — numbered SQL files are the schema source of truth. Apply via Supabase CLI or SQL editor; CLI is optional at v1.
- **No `lib/api/` client layer** — Server Components read Supabase directly. A REST tier between RSC and Postgres is overhead for an internal tool.

---

## Architectural Patterns

### Pattern 1: Single Cron Orchestrator with Per-Object Watermarks

**What:** One `/api/cron/sync` endpoint runs the full daily pipeline sequentially. Each SF object stores a watermark (`last_modified_date_seen`). Each extract is `WHERE LastModifiedDate >= :watermark`. Watermarks only advance after a successful extract+load for that object.

**When:** Small data volume (low hundreds of thousands of rows), daily refresh, single-tenant. Anything bigger or sub-daily would need queueing.

**Trade-offs**
- **Pros:** One deployable, one log to read, idempotent upserts on SF Id make re-runs safe.
- **Cons:** No parallelism beyond what Postgres + SF give for free. If one object fails, downstream marts shouldn't refresh on stale data — mitigated by **only refreshing marts after every extract succeeds**.

**Skeleton**
```ts
// lib/sync/orchestrator.ts
export async function runSync() {
  const run = await startRun();           // ops.sync_runs, status='running'
  try {
    await syncObject('Account');
    await syncObject('Contact');
    await syncObject('Campaign');
    await syncObject('CampaignMember');
    await syncObject('Opportunity');
    await syncObject('OpportunityContactRole');
    await syncObject('Presentation__c');

    await refreshMarts([
      'mart.touchpoints',
      'mart.attribution_contact',
      'mart.attribution_account',
      'mart.funnel_snapshots',
    ]);

    await finishRun(run.id, 'success');
  } catch (err) {
    await finishRun(run.id, 'failed', err);
    throw err; // surface to Vercel logs + Slack alerting
  }
}
```

### Pattern 2: Three-Layer Schema (raw → stage → mart) — Lightweight Variant

**What:** Mirror Salesforce 1:1 in `raw.*` tables, build typed/cleaned views in `stage.*`, pre-compute query-shaped facts/aggregates in `mart.*` materialized views. Refresh marts at the end of each sync run. **No dbt** — just numbered SQL migrations and `REFRESH MATERIALIZED VIEW`.

**When:** When you need query-time speed for dashboards but don't want the operational weight of dbt at v1 scale.

**Trade-offs**
- **Pros:** Clear separation of ingestion (raw) from analytics (mart). Backfills are trivial (re-extract, re-refresh). Marts are versioned as migrations. No "queries reach into raw tables everywhere" mess.
- **Cons:** Materialized views must be `REFRESH`ed manually (no auto-incremental in stock Postgres). At 15K Contacts × low-100Ks CampaignMembers this is sub-second; revisit if touchpoints exceed ~10M.

**Why not dbt at v1:** dbt adds a separate runtime, separate deploy story, and a Python/dbt-Cloud dependency. The whole project is "ship in 2–4 weeks on free tiers." A directory of SQL migrations + matviews matches that scope. dbt becomes worth it when (a) more than one person edits transforms, (b) you need lineage docs, (c) you have >50 marts.

**Touchpoint mart**
```sql
-- supabase/migrations/0004_mart_touchpoints.sql
create materialized view mart.touchpoints as
select
  cm.id                       as campaign_member_id,
  cm.contact_id,
  c.account_id,
  cm.campaign_id,
  cam.name                    as campaign_name,
  cam.type                    as campaign_type,
  coalesce(cm.first_responded_date, cm.created_date) as touchpoint_at,
  cm.status                   as member_status,
  c.mql_date_c, c.sql_date_c, c.opportunity_date_c, c.customer_date_c
from stage.campaign_member cm
join stage.contact   c   on c.id   = cm.contact_id
join stage.campaign  cam on cam.id = cm.campaign_id;

create unique index on mart.touchpoints (campaign_member_id);
create index on mart.touchpoints (contact_id, touchpoint_at);
create index on mart.touchpoints (account_id, touchpoint_at);
create index on mart.touchpoints (campaign_id);
```

### Pattern 3: Pre-Computed Attribution at Sync Time, Not Query Time

**What:** Linear-attribution math runs as part of the daily sync (`mart.attribution_contact` materialized view), not on each dashboard request. Server Components read the pre-computed table.

**Trade-offs**
- **Pros:** Dashboard queries become trivial `SELECT … FROM mart.attribution_contact`. Latency is small and predictable. Filter/pivot is `WHERE` + `GROUP BY` on a fact table.
- **Cons:** Adding a new attribution model = a new migration + a re-sync. Acceptable: attribution models change rarely.
- **Tradeoff vs. on-demand SQL:** On-demand keeps schema lean but makes every page slower and harder to filter. With <1M touchpoints the math is fast either way, but filter combinations multiply on-demand cost.

**Linear attribution (per Contact, per milestone)**
```sql
-- mart.attribution_contact: one row per (contact, milestone, campaign) with linear credit (1/N).
create materialized view mart.attribution_contact as
with milestones as (
  select id as contact_id, 'sql'         as milestone, sql_date_c          as milestone_at from stage.contact where sql_date_c          is not null
  union all
  select id, 'opportunity', opportunity_date_c from stage.contact where opportunity_date_c is not null
  union all
  select id, 'customer',    customer_date_c    from stage.contact where customer_date_c    is not null
),
windowed as (
  select m.contact_id, m.milestone, m.milestone_at,
         t.campaign_id, t.campaign_type, t.touchpoint_at
  from milestones m
  join mart.touchpoints t
    on t.contact_id   = m.contact_id
   and t.touchpoint_at <= m.milestone_at
),
denom as (
  select contact_id, milestone, count(*) as n
  from windowed
  group by 1, 2
)
select w.contact_id, w.milestone, w.campaign_id, w.campaign_type,
       1.0 / d.n as credit,
       w.milestone_at, w.touchpoint_at
from windowed w
join denom d using (contact_id, milestone);

create index on mart.attribution_contact (campaign_id, milestone);
create index on mart.attribution_contact (contact_id, milestone);
```

### Pattern 4: Account Rollup as Aggregation, Not Parallel Fact

**What:** `mart.attribution_account` is a `GROUP BY account_id` rollup of `mart.attribution_contact` joined through `stage.contact.account_id`. Don't maintain a parallel touchpoint stream at the Account level.

**Why:** "Account credit = sum of its Contacts' credit" by spec. A parallel pipeline would duplicate work and risk drift.

### Pattern 5: Server Components Read Marts Directly (No REST Layer)

**What:** Each dashboard page is a Server Component that imports the server-side Supabase client and runs a query. No `/api/dashboard/*` routes. Filter state lives in URL `searchParams`, parsed in the page, passed straight into the SQL query.

**Trade-offs**
- **Pros:** One less abstraction. Filter changes navigate the URL → RSC re-renders → fresh query. Shareable URLs are free. No client/server contract drift.
- **Cons:** Heavy client interactivity (drill-down without nav) needs a Route Handler or Supabase RPC. Add those *only* where a page demands it.

```ts
// app/(dashboard)/campaigns/page.tsx
import { createServerClient } from '@/lib/supabase/server';
import { parseFilters } from '@/lib/filters/parse';

export default async function Page({ searchParams }: { searchParams: Record<string,string> }) {
  const filters = parseFilters(searchParams);
  const sb = createServerClient();
  const { data } = await sb
    .from('attribution_contact')
    .select('campaign_id, campaign_type, milestone, credit')
    .eq('milestone', filters.milestone)
    .gte('milestone_at', filters.dateRange.from)
    .lte('milestone_at', filters.dateRange.to);
  return <CampaignContributionView rows={data ?? []} filters={filters} />;
}
```

### Pattern 6: Filter State as URL searchParams

**What:** All dashboard filters live in the URL (`?from=2026-01-01&to=2026-04-30&type=Webinar`). A `parseFilters(searchParams)` helper returns a typed object (zod recommended). Filter UI is controlled by URL via `router.replace(...)`.

**Trade-offs:** Shareable, bookmarkable, no extra state library. Cost: filter changes trigger a navigation (RSC re-render) — fine for daily-refreshed data.

### Pattern 7: Watermark + Idempotent Upsert for Failure Recovery

**What:** Each object has a watermark; the next run re-fetches the same window if the previous failed. Inserts are `ON CONFLICT (sf_id) DO UPDATE`. Upserts are idempotent.

**Why:** Cheaper than wrapping the whole pipeline in a Postgres transaction. Bulk 2.0 jobs may take minutes; you don't want to hold a transaction that long.

---

## Data Flow

### Daily Sync Flow (cron-driven)

```
06:00 UTC — Vercel Cron fires (hobby: dispatched within the hour)
    ↓
POST /api/cron/sync   (verifies CRON_SECRET header)
    ↓
ops.sync_runs INSERT (status='running')
    ↓
For each object in [Account, Contact, Campaign, CampaignMember,
                    Opportunity, OpportunityContactRole, Presentation__c]:
    ├─ read watermark from ops.watermarks
    ├─ jsforce.bulk2.query(`SELECT … WHERE LastModifiedDate >= :watermark`)
    ├─ stream records → upsert into raw.sf_<object> (ON CONFLICT (id) DO UPDATE)
    ├─ on success: write new watermark = max(LastModifiedDate)
    └─ on error: ops.sync_errors INSERT, abort run
    ↓
REFRESH MATERIALIZED VIEW CONCURRENTLY mart.touchpoints
REFRESH MATERIALIZED VIEW CONCURRENTLY mart.attribution_contact
REFRESH MATERIALIZED VIEW CONCURRENTLY mart.attribution_account
REFRESH MATERIALIZED VIEW CONCURRENTLY mart.funnel_snapshots
    ↓
ops.sync_runs UPDATE (status='success', finished_at, row_counts)
```

### Read (Dashboard) Flow

```
User opens /campaigns?from=…&type=…
    ↓
Next.js Server Component runs on Vercel
    ↓
parseFilters(searchParams) → typed filter
    ↓
supabase-js (server, anon + user JWT) → Postgres
    ↓ SELECT … FROM mart.attribution_contact WHERE …
Postgres returns rows
    ↓
Server Component renders charts (Recharts/Tremor)
    ↓
Streamed HTML/RSC → browser
```

### Auth Flow

```
User clicks "Sign in with Google"
    ↓
Supabase Auth → Google OAuth
    ↓
Callback → Supabase exchanges code → session cookie
    ↓
Postgres trigger on auth.users INSERT:
   IF email NOT LIKE '%@<allowed-domain>' THEN RAISE EXCEPTION
    ↓
Session cookie set; redirect to /
```

### Sync Ordering Rationale

The pipeline must run in dependency order because mart joins depend on FK tables:

```
Account                 — independent
   ↓
Contact                 — needs Account (account_id FK)
   ↓
Campaign                — independent of Contact, but conventionally fetched here
   ↓
CampaignMember          — needs Contact + Campaign
   ↓
Opportunity             — needs Account
   ↓
OpportunityContactRole  — needs Opportunity + Contact
   ↓
Presentation__c         — needs Contact (the SQL trigger source)
```

**Where to parallelize:** Account ‖ Campaign can run in parallel; CampaignMember waits for both. Opportunity can run in parallel with CampaignMember. **For v1, do not parallelize.** Sequential is simpler and the entire pipeline at this scale fits well under 300s. Add parallelism only if profiling shows the cron approaching the timeout.

---

## Key Architectural Decisions (with the recommendation)

### Decision: Vercel Cron + serverless function — **YES** vs. Supabase Edge Functions or pg_cron + FDW

**Recommendation:** Vercel Cron → serverless Node fn → jsforce → Supabase upserts.

**Why not pg_cron + foreign data wrapper to Salesforce:** No first-party Salesforce FDW exists. A third-party HTTP-based FDW would introduce an unsupported dependency, and Bulk API 2.0's async job model (submit → poll → download CSV) is awkward to express as an FDW. pg_cron is excellent for *triggering* work, a poor place to *do* the work.

**Why not Supabase Edge Functions (Deno):** Viable, but (a) jsforce is Node-first; the Deno port is community-maintained and rougher; (b) the rest of the stack (Next.js) is on Vercel — adding Edge Functions splits the deploy story; (c) Vercel hobby cron is free at 1×/day with 300s default `maxDuration`.

**Verified facts (Context7):**
- Vercel hobby cron: limited to 1 invocation/day. The spec says daily, so this is exactly enough.
- Vercel Functions default `maxDuration` is 300s; Pro can extend up to 800s. Hobby is capped at 300s.
- Hobby cron jobs are dispatched within the **specified hour** (not the minute) — fine for a daily sync.

### Decision: Schema layout — **raw → stage → mart, with materialized views**

- `raw.*` — real tables, 1:1 with SF, written by the sync.
- `stage.*` — plain views (not materialized) with type casts, renames, computed flags.
- `mart.*` — **materialized views** refreshed at the end of each sync run with `CONCURRENTLY`.

**Why three layers, not two:** Skipping `stage.*` couples mart definitions to SF column naming. A thin staging layer means renames in SF don't ripple through every mart.

**Why matviews vs. populating real tables in the cron:** `REFRESH MATERIALIZED VIEW CONCURRENTLY` keeps dashboards readable during refresh. Defining marts as SQL versions the transformation logic alongside migrations.

### Decision: Time-series snapshots — **defer**

Current-state-of-truth is enough for v1. The `mql_date_c / sql_date_c / opportunity_date_c / customer_date_c` columns on Contact already encode the funnel transition timeline. Daily snapshots become valuable only when stages get reverted or someone asks "as of last quarter, what was our funnel composition" in a way the timestamp columns can't answer. Add when needed.

### Decision: Where the linear-attribution math lives — **SQL materialized view**

A `WITH` chain inside `mart.attribution_contact` (Pattern 3). Mirror it in `lib/attribution/linear.ts` as a TypeScript reference **for unit tests only** — production reads from Postgres.

**Why SQL not PL/pgSQL functions:** Declarative, easier to read in a migration, trivially refreshable. Functions are a step up in complexity with no benefit at this scale.

**Why not in the application:** Recomputing on each request burns CPU per page load, doubles the test surface, and slows dashboards as data grows. Pre-compute once daily, query many times.

### Decision: Account rollup — **aggregation of contact attribution**

`mart.attribution_account` = `SELECT account_id, sum(credit) … FROM mart.attribution_contact JOIN stage.contact USING (id) GROUP BY …`. No separate Account-touchpoint pipeline.

### Decision: API layer — **none; Server Components read Supabase directly**

No `/app/api/dashboard/*` routes. Add Route Handlers only for (a) CSV/PDF export, (b) the cron endpoint.

### Decision: Filter encoding — **URL searchParams + zod**

Encode every dashboard filter as URL params. Use a zod parser at the page boundary to convert `searchParams` → typed filter object → SQL.

### Decision: Caching — **Postgres materialized views ARE the cache**

- Primary cache: `mart.*` matviews. They *are* the precomputed result set.
- Page caching: skip Vercel Data Cache for v1; rely on RSC re-rendering. Optionally call `revalidatePath('/...')` at the end of the sync to invalidate any default fetch caches on dashboard pages.
- React Query / SWR: not needed for v1.

Adding the Vercel Data Cache layer adds invalidation complexity for negligible win at 4–10 users.

### Decision: Auth & RLS — **Google SSO + domain trigger + RLS as defense-in-depth**

- Google SSO via Supabase Auth.
- Email/password disabled by default; enabled as fallback only if Google OAuth setup snags.
- Domain allowlist enforced as a **Postgres trigger on `auth.users` INSERT** that aborts inserts where `email NOT LIKE '%@<allowed-domain>'`. Stronger than relying on the OAuth provider config alone.
- RLS **on**, with policy `for select using (auth.role() = 'authenticated')` on `mart.*`. Overkill for an internal tool, but it's two lines of SQL and protects you the day someone accidentally exposes the anon key publicly.
- Service-role key used **only** in `/api/cron/sync` (server-side env var, never shipped to client). Service role bypasses RLS — required for the upsert path.

### Decision: Observability — **Postgres-first**

- `ops.sync_runs` — one row per cron invocation: `id, started_at, finished_at, status, row_counts jsonb, error text, error_object`.
- `ops.sync_errors` — per-object error capture.
- `/admin/sync` page reads `ops.sync_runs` and renders the last 30 days.
- **Vercel logs** for the actual log stream of the cron fn (free, retained on Vercel).
- Notifications: try/catch wrapping the orchestrator; on failure, POST to a Slack incoming webhook (URL in env). Skip email/Logtail/external services for v1.

---

## Build Order — 2–4 Week Vertical-MVP Slice

**Recommendation:** Ship **one dashboard end-to-end first**, then layer the remaining four on top. **Do not** build the sync to completion before any UI exists — that's the trap.

### Week 1 — End-to-end skeleton ("hello, attribution")
Goal: a deployed Vercel app, gated by Google SSO, showing one chart of real Salesforce data.

1. Vercel + Supabase project bootstrapped, Next.js App Router scaffolded.
2. Supabase Auth: Google SSO + domain-allowlist trigger.
3. SF Connected App + jsforce auth (JWT bearer flow recommended).
4. Manual one-shot sync script (Node, run locally) that pulls **just `Contact` + `Campaign` + `CampaignMember`** with no watermark, full extract, into `raw.*`.
5. `mart.touchpoints` matview + `mart.attribution_contact` (linear) + `mart.attribution_account`.
6. **One dashboard:** "Campaign Contribution to SQLs" — simplest of the five (`GROUP BY campaign, milestone='sql'`).

### Week 2 — Productionize the sync, harden one dashboard
1. Move sync into `/api/cron/sync` Route Handler; wire Vercel Cron.
2. Add per-object watermarks + `ops.sync_runs` + `ops.sync_errors`.
3. Add `Account`, `Opportunity`, `OpportunityContactRole`, `Presentation__c` to the sync.
4. Slack-webhook failure notifications.
5. Filter state via URL searchParams: date-range + campaign-type filters on the campaign dashboard.

### Week 3 — Build the remaining four dashboards
Each reuses `mart.*` — they're new pages, not new pipelines.
1. Account-Level Attribution
2. Revenue & Closed Won (joins `mart.attribution_contact` to `stage.opportunity` via OCR)
3. Touchpoint Depth Analysis (`COUNT(*)` per `(contact, milestone)` from `mart.touchpoints`)
4. Contact Journey (window-function-driven sequence per Contact)

### Week 4 — Polish, observability page, ship
1. `/admin/sync` page reading `ops.sync_runs`.
2. CSV export on each dashboard.
3. Visual polish (Tableau-like density, muted palette).
4. Manual smoke test of failure modes (kill the sync mid-run, re-run, confirm idempotency).
5. Stakeholder demo + collect first round of validation feedback.

### Deferrable (post-v1)
- dbt migration
- Snapshot tables for historical lifecycle state
- Per-user roles / permissions beyond "is in the org"
- Position-based or time-decay attribution models
- Real-time / sub-daily refresh
- A Route Handler API for non-RSC consumers
- Background queue / pgmq for sync — only if pipeline outgrows 300s

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **Now (4–10 users, ~15K Contacts, low-100Ks CampaignMembers)** | Stock setup. Sequential sync, matviews refreshed at end of run, Server Components query Postgres. |
| **3–5× growth in CampaignMembers (~1M)** | Matview refresh starts to bite. Use `REFRESH … CONCURRENTLY` (already recommended), add covering indexes. Parallelize Account ‖ Campaign ‖ Opportunity extracts. |
| **10× growth or sub-daily refresh** | Sync no longer fits in a 300s serverless invocation. Move ETL to a queue + worker (Inngest, Trigger.dev, pg_boss + Edge Function). Switch from full matview refresh to incremental updates. dbt becomes worth it here. |
| **>10M touchpoints or self-serve users** | Postgres still fine, but consider partitioning `mart.touchpoints` by month, columnar storage (Citus columnar, TimescaleDB hypertables for snapshots), or a dedicated OLAP engine (DuckDB-on-files, ClickHouse) downstream. |

### Scaling Priorities (what breaks first)

1. **Vercel cron 300s ceiling.** First wall this trajectory hits. Mitigation: parallelize per-object extracts; if still tight, split into multiple cron endpoints (extract → transform → refresh) chained via DB state.
2. **Materialized view refresh time.** Once refresh exceeds ~30s, pages may briefly serve stale data even with `CONCURRENTLY`. Mitigation: incremental matviews (manual implementation) or move marts to scheduled real tables populated by `INSERT … ON CONFLICT`.
3. **Salesforce API limits.** SF caps daily API calls per org. Bulk 2.0 reduces the count dramatically vs. REST, but a runaway full-resync is the risk. Enforce watermarks; alert on "full-resync requested" branches.

---

## Anti-Patterns

### Anti-Pattern 1: "Just re-fetch everything every night"
**What people do:** Skip watermarks, do `SELECT … FROM Contact` (no WHERE) every night.
**Why wrong:** Burns SF API quota, scales linearly with table size, ingestion time grows unbounded, you still need the upsert path because of races.
**Instead:** Watermark per object. Full resync is a separate code path triggered by clearing the watermark — for backfills only.

### Anti-Pattern 2: "Skip the raw layer; transform during ingest"
**What people do:** SF → directly into `mart.touchpoints`-shaped tables, transforming inside the cron.
**Why wrong:** Lose ability to re-derive marts without re-syncing SF. Backfills require re-extraction. Schema bugs corrupt your only copy.
**Instead:** Raw tables are sacred. Transformations live in SQL. Re-deriving marts is `REFRESH MATERIALIZED VIEW`, not "re-pull from Salesforce."

### Anti-Pattern 3: Computing attribution in TypeScript at request time
**What people do:** RSC fetches all CampaignMember rows for a Contact, runs the linear math in TS.
**Why wrong:** N×M cost on every page load; doubles the test surface; slows dashboards as data grows. SQL ends up the source of truth anyway.
**Instead:** SQL materialized view is canonical. The TS implementation exists *only* as a reference for unit tests against fixtures.

### Anti-Pattern 4: Over-using RLS as the only access control
**What people do:** Skip the domain-allowlist trigger; rely solely on RLS policies that check `auth.email() LIKE '%@domain'`.
**Why wrong:** RLS runs on every query. And it doesn't *prevent* unauthorized accounts from existing — it just blocks their reads. An unauthorized session is a foothold.
**Instead:** Block account creation at the trigger. Use RLS as defense-in-depth.

### Anti-Pattern 5: Service-role key in the browser
**What people do:** Use service-role for everything because "RLS is annoying."
**Why wrong:** Service-role bypasses RLS. If it leaks (env-var misconfigured, accidentally committed, pulled into a Client Component), the entire DB is readable/writable.
**Instead:** Service-role is *only* in `/api/cron/sync` and any other Route Handler with a justified bypass. Server Components for dashboards use the anon key + the user's JWT.

### Anti-Pattern 6: One giant `sf_records` table with a JSONB blob
**What people do:** `create table sf_records (id text primary key, type text, data jsonb)` because "the schema can change."
**Why wrong:** Loses indexes on common keys. Joins become `data->>'AccountId'` which Postgres can't optimize as well. Type errors surface at query time.
**Instead:** A real table per SF object with explicit columns for fields you care about. JSONB column on the side for "everything else, in case we need it later" is fine.

### Anti-Pattern 7: Refresh materialized views after each object instead of after the full sync
**What people do:** `REFRESH` after each extract finishes.
**Why wrong:** Mart joins span multiple tables. Refreshing after Contact but before CampaignMember produces an inconsistent snapshot — and you waste compute since you'd refresh again.
**Instead:** All extracts must succeed before the *first* mart refresh. If any extract fails, leave marts at yesterday's data — that's the safer failure mode.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Salesforce** | jsforce client, OAuth2 (JWT bearer flow recommended) → Bulk API 2.0 query jobs | Use Bulk 2.0 (`conn.bulk2.query()`) for any object you expect >2K rows from; REST is fine for tiny objects. Bulk 2.0 is async — submit, poll, stream. jsforce abstracts the polling. |
| **Supabase Postgres** | `@supabase/supabase-js`, three flavors of client: anon (browser), server-anon (RSC, RLS-on, user JWT), service-role (cron only). | Generated TS types via `supabase gen types typescript`. |
| **Supabase Auth** | Google OAuth provider in Supabase dashboard; redirect to `/auth/callback`. Domain-allowlist enforced in DB trigger. | Email/password kept disabled unless Google OAuth setup hits a snag. |
| **Vercel Cron** | `vercel.json` with `{ "crons": [{ "path": "/api/cron/sync", "schedule": "0 6 * * *" }] }`. | Hobby plan: 1×/day max. Verify cron secret in the route handler (Vercel sets `Authorization: Bearer $CRON_SECRET`). |
| **Slack (optional)** | Incoming webhook URL in env; POST JSON on sync failure. | Skip for v1 if no Slack workspace; surface failures in `/admin/sync` and Vercel logs. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **`lib/sync/` ↔ `app/(dashboard)/`** | None — UI never imports from sync. | Sync writes to Postgres; UI reads from Postgres. Postgres is the contract. |
| **`lib/attribution/` ↔ `mart.*`** | TS implementation mirrors SQL view; tests assert equivalence on fixtures. | If they diverge in production behavior, SQL wins. |
| **`lib/supabase/server.ts` ↔ `lib/supabase/service.ts`** | Two distinct clients, distinct keys. Service-role is only ever imported by `app/api/cron/sync/route.ts`. | Add an eslint rule or runtime assertion to enforce non-import in client/RSC code. |
| **Server Components ↔ Route Handlers** | SCs query Postgres directly. Route Handlers exist only for cron + export. | Don't introduce a "data layer" Route Handler that SCs call into. |

---

## Sources

- Vercel Cron Jobs — usage, pricing, hobby limits — https://vercel.com/docs/cron-jobs/usage-and-pricing (verified via Context7, HIGH)
- Vercel Functions — limits, max duration — https://vercel.com/docs/functions/limitations (verified via Context7, HIGH)
- Vercel Cron — duration & accuracy — https://vercel.com/docs/cron-jobs/manage-cron-jobs (verified via Context7, HIGH)
- Supabase pg_cron + Edge Functions scheduling — https://supabase.com/docs/guides/cron/quickstart, https://supabase.com/docs/guides/functions/schedule-functions (verified via Context7, HIGH)
- Supabase Row Level Security — https://supabase.com/docs/guides/auth/row-level-security (verified via Context7, HIGH)
- Supabase Postgres roles — https://supabase.com/docs/guides/database/postgres/roles (verified via Context7, HIGH)
- Supabase securing data, service-role usage — https://supabase.com/docs/guides/database/secure-data (verified via Context7, HIGH)
- jsforce Bulk API 2.0 query/streaming — https://github.com/jsforce/jsforce.github.io/blob/main/src/partials/document/v2-bulk.html.md (verified via Context7, HIGH)
- Three-layer dbt-style schema (raw / staging / marts) — established BI pattern (MEDIUM — pattern is canonical, the "skip dbt at v1" call is opinionated)
- Linear-attribution SQL pattern — derived from spec; arithmetic verified (1/N split per Contact-milestone window) (MEDIUM on the specific SQL above; HIGH on the pattern)
