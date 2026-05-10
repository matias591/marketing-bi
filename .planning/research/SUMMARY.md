# Research Summary

**Project:** Marketing BI — Salesforce-sourced multi-touch attribution dashboard on Vercel + Supabase
**Date:** 2026-05-10
**Research dimensions covered:** Stack, Features, Architecture, Pitfalls
**Overall confidence:** HIGH

This summary distills the four research files into the decisions and tensions that should drive roadmap creation.

---

## TL;DR

A small, focused stack — **Next.js 16 App Router on Vercel + Supabase Postgres + jsforce + ECharts/TanStack Table** — running a daily Vercel-Cron Salesforce sync into a `raw → stage → mart` Postgres model, with attribution computed in materialized views and rendered by Server Components reading the marts directly. Five dashboards, no chart authoring, no multi-tenant, no real-time. The 2–4 week timeline is realistic if (and only if) we ship a vertical slice end-to-end in week 1 and resist the "perfect sync first" trap.

---

## Recommended Stack (locked-in)

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend / hosting** | Next.js 16.x App Router on Vercel, Node runtime everywhere | Server Components query Postgres directly, Vercel Cron is built-in, no extra services. **Avoid Edge runtime** for any DB/SF code. |
| **UI primitives** | Tailwind 4 + shadcn/ui (copy-paste, no runtime lock-in) | Fits dense Tableau aesthetic better than MUI. |
| **Charts** | Apache ECharts 6 + `echarts-for-react` | The **only free library** with native Sankey (Contact Journey) AND Funnel (MQL→SQL→Opp→Customer) as first-class chart types. |
| **Pivot tables** | TanStack Table 8 with `getGroupedRowModel` + `aggregationFn` | Free pivot/group/aggregate. **Avoids AG Grid Enterprise license** (paywall). |
| **DB / auth** | Supabase (Postgres 15 + Auth + RLS) | Free tier (500 MB DB, 50K MAU) fits the data volume cleanly. Postgres-native = full SQL for attribution. Google OAuth out of the box. |
| **DB driver** | `postgres` (porsager) via Supavisor **transaction mode (port 6543)** with `prepare: false`, `max: 1` | Required pattern for Vercel serverless + Supabase. Direct connections will exhaust the pool. |
| **ORM** | Drizzle ORM 0.45.x (stay 0.x — 1.0 still RC) + `drizzle-kit` | SQL-first, supports materialized views, lightweight cold-start. Avoid Prisma (heavy on serverless, weak on analytical SQL). |
| **Salesforce client** | `@jsforce/jsforce-node` 3.10.x via OAuth JWT Bearer Flow | Same maintainer/version as `jsforce` but **2.2 MB unpacked vs 34.5 MB** — critical for Vercel function size. JWT bearer = no refresh-token rotation, perfect for cron. |
| **Auth** | Supabase Auth + Google OAuth (`hd=` param) + server-side domain trigger; email/password as fallback | `hd` is spoofable client-side, so enforce domain server-side too. **Build email/password fallback first** — Workspace OAuth setup can block for days. |
| **Local dev / CI** | `supabase start` for local stack, `supabase gen types`, vitest for attribution unit tests | Drizzle owns schema; Supabase migrations applied in CI. |

**Explicit avoids:** Tremor (unmaintained since Jan 2025), AG Grid Enterprise (paywall), Apache Superset (architecture mismatch), Plotly (huge bundle), Pages Router (frozen), `@supabase/auth-helpers-nextjs` (deprecated → use `@supabase/ssr`), NextAuth + Supabase together (two session systems = footgun), GraphQL (no value at one-team scale), dbt (overhead > value at this size), Fivetran/Airbyte (cost > rest of stack).

---

## Architecture (one paragraph)

**Vercel Cron** (multiple per-object daily entries, staggered by hour) calls `/api/cron/sync-*` Route Handlers. Each handler uses `@jsforce/jsforce-node` Bulk API 2.0 (or REST `query` for tiny objects) with a per-object `LastModifiedDate` watermark to extract incremental changes from Salesforce, then upserts via service-role into `raw.sf_*` Postgres tables (1:1 SF mirror). A final cron then `REFRESH MATERIALIZED VIEW CONCURRENTLY`-es the `mart.*` layer (`mart.touchpoints`, `mart.attribution_contact`, `mart.attribution_account`, `mart.funnel_snapshots`) which contain the attribution math. **Server Components** in `app/(dashboard)/*` query the marts directly via Drizzle/Supavisor and render charts. Filter state lives in URL `searchParams` (zod-parsed). RLS is on with permissive `authenticated` policies; the real gate is Supabase Auth + a Postgres `auth.users` trigger blocking non-allowlisted email domains.

**Schema layout:**
- `raw.*` — real tables, 1:1 with SF, sacred (do not transform during ingest).
- `stage.*` — plain views with type casts and renames.
- `mart.*` — materialized views refreshed at end of each sync run (this IS the cache; no Redis).
- `ops.*` — `sync_runs`, `sync_errors`, `watermarks`, plus historical snapshots (see Pitfall 6).

**Build order — vertical-MVP slice:**
- **Week 1:** Vercel + Supabase scaffold, auth (email/password first), one-shot manual sync of just Contact + Campaign + CampaignMember, `mart.touchpoints` + `mart.attribution_contact` (linear), **one** dashboard ("Campaign Contribution to SQLs") wired up.
- **Week 2:** Productionize the sync as Vercel Cron, add Account/Opportunity/OCR/Presentation__c, watermarks + `ops.sync_runs`, Slack alerts, Google OAuth, URL filter state.
- **Week 3:** Build the remaining four dashboards (Account-Level, Revenue & Closed Won, Touchpoint Depth, Contact Journey).
- **Week 4:** `/admin/sync` page, CSV export, visual polish, failure-mode smoke testing, stakeholder demo.

---

## Features — What v1 Includes

The features research identified **21 table-stakes items**, **13 differentiators** (most pulled to v1.x), and **19 anti-features** (6 spec-mandated + 13 BI-pattern).

**Table stakes (must have or users perceive product as broken):**

| # | Feature | Maps to | Complexity |
|---|---------|---------|-----------|
| TS-1 | Global date-range picker affecting all charts | All goals | S |
| TS-2 | Global multi-select filter bar (campaign type, lifecycle stage, owner) | All goals | M |
| TS-3 | Attribution model toggle (First / Last / Linear) at dashboard scope | G1, G3, G4 | M |
| TS-4 | G1: Campaign-leaderboard bars (SQLs per campaign) | G1 | S |
| TS-5 | G1: Campaign-type rollup (grouped/stacked) | G1 | S |
| TS-6 | G1: Engagement-to-SQL conversion-rate funnel | G1 | M |
| TS-7 | G2: Contact timeline (drill-down target — every "tell me more" lands here) | G2 | M |
| TS-8 | G2: Common-journey aggregation (top sequence table; **defer Sankey to v1.x**) | G2 | **L** |
| TS-9 | G3: Account leaderboard table | G3 | S |
| TS-10 | G3: Campaigns-influencing-target-accounts | G3 | M |
| TS-11 | G4: Closed-Won revenue by campaign / type with model toggle | G4 | M |
| TS-12 | G5: Touchpoint-count distribution histogram | G5 | S |
| TS-13–21 | Drill-downs (campaign → contacts → individual journey), CSV export, freshness indicator, login + domain allowlist, sync run/admin view, mobile-readable layout, etc. | P | mostly S/M |

**Pull-into-v1 differentiators:**
- **D-1: Side-by-side attribution-model comparison** — strongest single argument vs. Salesforce native reports; structurally cheap once the model toggle exists.
- **D-6: Shareable URL with encoded filter state** — replaces ~80% of "saved views" value; cheap.
- **D-11: Excluded-record reasons per chart** — the explicit credibility builder (matters more here than typical BI because users will cross-reference numbers against Salesforce).

**Skip in v1:**
- Saved views (D-5) — at 4–10 users, config-management overhead exceeds value; D-6 covers most of the same need.
- All other differentiators — backlog them.

**Anti-features (do not build, ever):**
- Self-service chart builder (the entire reason this isn't just Tableau).
- Per-chart custom filters (slippery slope to chart builder).
- RBAC / per-user permissions.
- Additional attribution models beyond the three specified.
- Alerting / scheduled email digests.
- Any non-Salesforce data source for v1.
- Multi-tenant.
- AI / "ask your data in English."

**Recommended dashboard build order:** G1 (Campaign Contribution) → G4 (Revenue) → G2 (Contact Journey) → G3 (Account-Level) → G5 (Touchpoint Depth). Loudest user need first, highest-stakes second, drill-target third, ABM fourth, complementary distribution last.

---

## Top Pitfalls That Shape the Roadmap

The pitfalls research identified 30 specific risks. The ones that **must shape the roadmap structure**, not just be addressed in passing:

### Critical / project-breaking (MUST address explicitly)

1. **Sync-first death march (Pitfall 15)** — Engineers love the data plumbing; week 3 ends with a perfect warehouse and zero dashboards. **Roadmap implication:** Phase 1 must produce a deployed dashboard with stub data, NOT a complete sync. Sync depth comes in Phase 2/3.

2. **Trigger-cascade timeouts (Pitfall 1)** — A single Salesforce admin flow can flip every Contact's `LastModifiedDate`, blowing the Vercel 300s cron limit. **Roadmap implication:** Use Bulk API 2.0 from day 1 for any high-volume object (Contact, Campaign Member). Plan multi-cron staggered architecture before writing sync code.

3. **`Original Source` field rewrites (Pitfall 6)** — HubSpot can rewrite first-touch values when emails change, silently breaking historical first-touch attribution. **Roadmap implication:** A `contact_source_history` snapshot table must exist from the **first** sync — this is a schema decision, not a feature. If we wait, history is unrecoverable.

4. **Unbounded multi-touch (Pitfall 7)** — Linear attribution across a Contact's full lifetime gives every campaign 1/N credit; with N=80 lifetime memberships, every campaign looks equally important. **Roadmap implication:** Cap multi-touch window at **90 days before lifecycle transition** by default (configurable, never zero). Treat only "Responded" Campaign Members as touchpoints.

5. **Supavisor + prepared statements (Pitfall 4)** — Direct DB connections will exhaust the free-tier pool; transaction-mode pooler breaks prepared statements. **Roadmap implication:** Document the connection pattern in Phase 1 setup; smoke-test 5 concurrent dashboard requests before declaring "done."

### High-impact (must mitigate, less roadmap-shaping)

6. **SF report reconciliation rabbit hole (Pitfall 8)** — Two days lost to "is our math wrong, or is SF wrong?" **Mitigation:** Methodology one-pager signed off by marketing director **before** writing attribution code. Pick one SF report to validate against.

7. **Google OAuth blocking (Pitfall 13)** — Workspace admin involvement can be a 2-day blocker. **Mitigation:** Email/password (or magic-link) auth ships first; OAuth is a Phase 2 enhancement; OAuth ticket filed Day 1.

8. **Chart-builder scope creep (Pitfall 14)** — "Can I just tweak this one chart?" requested constantly. **Mitigation:** Define "pivot-style explorable" in writing — each dashboard has up to 4 pre-defined slice dimensions, no others.

9. **Cron timing drift (Pitfall 2)** — Hobby cron fires "any time within the hour." **Mitigation:** Display freshness from `MAX(synced_at)` in the data, not the cron schedule.

10. **Hobby once-per-day cron limit (Pitfall 3)** — Cron expressions like `*/30 * * * *` fail at deploy. **Mitigation:** Plan N daily crons staggered by hour from day 1.

### Medium / Phase-3 attribution-engine concerns

11. **Campaign Member duplication (Pitfall 11)** — Same (Contact, Campaign) pair appearing multiple times double-counts touchpoints. **Mitigation:** Dedupe on (ContactId, CampaignId) in `mart.touchpoints` definition.

12. **Soft-deletes / Contact merges (Pitfall 12)** — Default SOQL excludes `IsDeleted=true`; merges reassign Campaign Members. **Mitigation:** Use `queryAll` for Contact/Account/CampaignMember; weekly reconciliation pass.

13. **Lifecycle stage double-counting (Pitfall 19)** — Contact transitioning MQL→SQL→Opp→Customer counts campaigns three times if not specced. **Mitigation:** Methodology doc explicit on per-stage attribution semantics.

### Worth knowing (UX checklist for Phase 4)

- Filter state must live in URL (Pitfall 25).
- Cap each dashboard page at 3–4 primary charts; batch queries (Pitfall 26).
- Sankey unreadable beyond ~20 distinct campaigns; cap top-N + "Other" bucket (Pitfall 27).
- Test on real iPhone 390×844 + Android 360×800; charts that don't reflow → KPI cards (Pitfall 28).

---

## Open Questions Worth Resolving Before Phase 3

These came up across multiple research dimensions — not blocking PROJECT.md or the roadmap, but should be answered before the attribution engine ships.

1. **Salesforce Edition / API call quota** — Enterprise (100K/day) vs. Professional (15K/day). The latter is tight if we add full reconciliation passes. Verify with the SF admin.
2. **Initial backfill volume** — "Hundreds of thousands" of Campaign Members fits Bulk v2 in one shot, but should be benchmarked. If it overflows the 500 MB free-tier DB, plan Supabase Pro ($25/mo) earlier.
3. **OCR Role weighting (Pitfall 21)** — v1 uses equal split across OCR Contacts on Closed Won credit. Confirm marketing director is OK with that vs. Decision Maker / Influencer weighting.
4. **Account segments / target-accounts list** — Does the SF Account object have a usable segment/tier field, or a "target accounts" list (e.g., for ABM)? Affects TS-2 filter content and TS-10 phrasing.
5. **Project business timezone** — UTC vs. NYC vs. PT for "yesterday" filter semantics (Pitfall 17). Pick one and bake it in.
6. **Currency** — USD-only or multi-currency? Affects TS-11 (revenue) complexity.

---

## Sources

- `.planning/research/STACK.md` — full stack rationale, package versions (current as of May 2026), avoid-list with reasons, Context7-verified for Vercel/Supabase/jsforce/ECharts/Drizzle/TanStack docs.
- `.planning/research/FEATURES.md` — full feature taxonomy (21 table-stakes, 13 differentiators, 19 anti-features), per-goal mapping, drill-down chain, dashboard build order.
- `.planning/research/ARCHITECTURE.md` — component diagram, three-layer schema, materialized-view patterns, sync orchestrator skeleton, anti-patterns, scaling notes.
- `.planning/research/PITFALLS.md` — 30 pitfalls across Salesforce data, attribution logic, Vercel/Supabase platform, dashboard UX, project execution; pitfall-to-phase mapping table.
