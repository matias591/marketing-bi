# State: Marketing BI

**Last updated:** 2026-05-10

## Project Reference

- **Project:** Marketing BI — Salesforce-sourced multi-touch attribution dashboard on Vercel + Supabase
- **Core value:** Marketing attribution that Salesforce reports can't answer cleanly — first-touch, last-touch, and linear multi-touch credit per Contact and Account across MQL → SQL → Opp → Customer, with methodology and freshness visible enough to be trusted.
- **Mode:** mvp (vertical slicing — ship one end-to-end attribution view fast, layer the rest)
- **Granularity:** standard
- **Timeline:** 2–4 weeks for v1
- **Team:** Solo developer + Claude (4–10 internal users as consumers)

## Current Position

- **Milestone:** v1
- **Phase:** Phase 1 — Vertical Slice + Auth Foundation
- **Plan:** Not yet planned (next: `/gsd-plan-phase 1`)
- **Status:** Roadmap complete; phase planning pending
- **Progress:** [░░░░░░░░░░░░░░░░░░░░] 0% (0/6 phases)

## Phase Pipeline

| # | Phase | Status |
|---|-------|--------|
| 1 | Vertical Slice + Auth Foundation | Pending plan |
| 2 | Production Sync Infrastructure | Not started |
| 3 | Attribution Engine | Not started |
| 4 | G1 + G4 Dashboards (Campaign + Revenue) | Not started |
| 5 | G2 + G3 Dashboards (Journey + Accounts) | Not started |
| 6 | Launch Surface (G5 + Polish + SSO) | Not started |

## Performance Metrics

- **Phases complete:** 0/6
- **Plans complete:** 0 (not yet planned)
- **Requirements mapped:** 59/59 ✓
- **Requirements validated:** 0/59
- **Pitfalls addressed:** 0/30 (mapping in `ROADMAP.md` § Pitfall Coverage)

## Accumulated Context

### Decisions Locked (from research + user approval)

- **Stack:** Next.js 16 App Router on Vercel (Node runtime everywhere) + Supabase (Postgres 15 + Auth + RLS) + Drizzle 0.45.x + `postgres` (porsager) + `@jsforce/jsforce-node` 3.10.x + ECharts 6 + TanStack Table 8 + Tailwind 4 + shadcn/ui.
- **Build order locked:** P1 ships auth-gated dashboard with seed data BEFORE any sync work (Pitfall 15 mitigation); email/password ships in P1, Google SSO in P6 (Pitfall 13 mitigation).
- **Dashboard build order:** G1 → G4 → G2 → G3 → G5 (split across P4/P5/P6).
- **Snapshot tables (`ops.contact_source_history`, `ops.campaigns_history`) populate from the FIRST sync run** — non-recoverable if delayed.
- **Attribution methodology:** 90-day window before transition, per-stage independent credit, strict `<` boundary, dedupe on `(contact_id, campaign_id)`, OCR equal split, soft-delete filter on attribution queries (raw retains soft-deletes).
- **Differentiators pulled into v1:** DASH-12 (side-by-side model comparison) and DASH-13 (excluded-record reasons per chart).
- **Connection pattern:** Supavisor transaction mode (port 6543), `prepare: false`, `max: 1`; service-role key only in `/api/cron/*`.
- **Cron pattern:** Vercel Hobby — one-per-day-per-object, staggered by hour; never `*/30 * * * *`; `Authorization: Bearer $CRON_SECRET` verified.
- **No dbt, no Redis, no separate worker service for v1.** Materialized views ARE the cache.

### Open Questions (to resolve before P3)

1. Salesforce Edition / API call quota (Enterprise 100K/day vs Professional 15K/day) — verify with SF admin.
2. Initial backfill volume — benchmark Bulk v2 against ~hundreds of K Campaign Members; consider Supabase Pro early if free-tier 500MB DB tightens.
3. OCR Role weighting — confirm marketing director is OK with v1 equal-split before P3 ships.
4. Account segments / target-accounts list field — affects PLAT-02 filter content and DASH-08 phrasing.
5. Project business timezone — UTC vs NYC vs PT (default `America/New_York` configurable via env per PLAT-06).
6. Currency — USD-only or multi-currency? Affects DASH-04 / Revenue dashboard.

### Active Todos

- File Google OAuth ticket with Workspace admin **on Day 1 of Phase 1** (Pitfall 13 — multi-day blocker risk).
- Schedule methodology-page sign-off meeting with marketing director before Phase 4 dashboards begin (Pitfall 8 — reconciliation rabbit hole).

### Blockers

None currently.

## Session Continuity

- **Last action:** Roadmap created (`/gsd-roadmap`); 6 phases derived, 59 requirements mapped, 0 orphans, 30/30 pitfalls assigned.
- **Files written this session:**
  - `.planning/ROADMAP.md`
  - `.planning/STATE.md`
  - `.planning/REQUIREMENTS.md` (traceability section updated)
- **Next action:** Run `/gsd-plan-phase 1` to break Phase 1 (Vertical Slice + Auth Foundation) into plans.

---
*State initialized: 2026-05-10*
