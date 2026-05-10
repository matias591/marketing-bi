# Phase 1: Vertical Slice + Auth Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-10
**Phase:** 1-vertical-slice-auth-foundation
**Areas discussed:** Sign-up gating, Domain allowlist policy, Seed fixture credibility (became "Live SF data" mid-discussion), Dashboard shell scope

---

## Sign-up Gating

### Q1: How should new users get onto the system in Phase 1?

| Option | Description | Selected |
|--------|-------------|----------|
| Open self-serve | Anyone with allowlisted email signs themselves up; no confirmation, no invite. Simplest. | |
| Email confirmation required | Supabase sends confirmation link before sign-in works. Free Supabase email = `@supabase.co` sender, rate-limited; custom SMTP needs setup. | |
| Invite-only (admin pre-creates) | Admin creates each user in Supabase Studio; invitee gets Supabase invite email with set-password link. Strictest but couples onboarding to manual admin work. | ✓ |

**User's choice:** Invite-only.

### Q2: Who can create new user accounts, and how?

| Option | Description | Selected |
|--------|-------------|----------|
| Just you, via Supabase Studio | Click "Invite user" in Supabase dashboard. Zero app code. | |
| Dev-only invite script | `pnpm invite email@orca-ai.io` calling admin API. CLI work in P1. | |
| Both | Studio + script. Most surfaces, most P1 work. | |
| (Other / freeform) | "Damin users we need to have end users and admin users" | ✓ |

**User's choice:** Freeform — clarified into a request for an admin/end-user role split.

**Notes:** Two follow-up questions resolved this:
- Should `/admin/users` page ship in Phase 1, or is it just the role on the record + Studio-only invites for now? → **Just the role on the record. `/admin/users` UI ships in Phase 6 alongside `/admin/sync`.**
- Who is the first admin? → **`matias@orca-ai.io`, seeded via SQL migration.**

### Q3: First-login password set page

| Option | Description | Selected |
|--------|-------------|----------|
| Custom `/auth/set-password` page | shadcn form on your domain matching the login UX. | ✓ |
| Supabase-hosted page | Zero code; Supabase shows their default UI on `supabase.co` domain. Unbranded. | |
| Magic-link only (no password) | Skip password entirely; OTP each time. ⚠ Conflicts with AUTH-01. | |

**User's choice:** Custom `/auth/set-password` page.

---

## Domain Allowlist Policy

### Q1: Which email domains should the Postgres trigger accept?

| Option | Description | Selected |
|--------|-------------|----------|
| Just `orca-ai.io` | Single hardcoded domain in trigger SQL. | ✓ |
| Multiple hardcoded | Static array (e.g., `['orca-ai.io', 'contractor.com']`). | |
| Env-var driven | Trigger reads `ALLOWED_DOMAINS` via Postgres setting. | |

**User's choice:** Just `orca-ai.io`, hardcoded.

### Q2: Rejection error message visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Specific message | `"Cannot invite bob@gmail.com — only @orca-ai.io email addresses are allowed."` Domain visible. | ✓ |
| Generic message | `"Invitation failed. This email is not eligible."` No allowlist pattern leaked. | |
| Specific + log to console | Both user-visible specific message and console.error with full DB error. | |

**User's choice:** Specific message.

---

## Live SF Data (originally "Seed Fixture Credibility")

### Q1: How realistic should the Phase 1 chart's seed data be?

| Option | Description | Selected |
|--------|-------------|----------|
| Anonymous-but-plausible | Generic-realistic names + believable counts. | |
| Real Orca campaigns | Use actual SF campaign names + counts. | ✓ |
| Obvious-stub data | "Test Campaign 1, 2, 3..." | |

**User's choice:** Real Orca campaigns.

### Q2: How should the real-data fixture be sourced?

| Option | Description | Selected |
|--------|-------------|----------|
| CSV checked in to repo | Manual export from SF; loaded via Drizzle seed script. | |
| Gitignored CSV in repo | Same path, not committed. | |
| Inline TS array in `db/seed.ts` | Hardcoded fixture in source. | |
| (Other / freeform) | "I prefer this to be pulled from salesforce, with real data" | ✓ |

**User's choice:** Freeform — pulled live from Salesforce, not a frozen fixture.

**Notes:** This represents a major scope shift. ROADMAP.md explicitly bounded Phase 1 around seed fixture + no-sync (Pitfall 15 mitigation). Three options were presented with tradeoffs:

- **A. One-shot dev SF dump → CSV (preserves boundary)** — `pnpm seed:from-sf` runs once locally, writes a CSV. Phase 1 deploy uses the CSV. Phase 2 builds production sync.
- **B. Push live SF read into Phase 1** — full SF connection in Phase 1; merges P1 + auth slice of P2; ~1 extra week; breaks Pitfall 15.
- **C. Stay with seed fixture, anonymous-but-plausible** — original recommendation; no real data.

**User chose B: live SF data in Phase 1, with full understanding of the timeline and Pitfall 15 implications.**

### Q3: Read direction — how does the chart get its data?

| Option | Description | Selected |
|--------|-------------|----------|
| On-demand SF → page | jsforce on every page load. Slow + API quota burn. | |
| Pull to Postgres on deploy + manual refresh button | First deploy runs extractor; chart reads Postgres; `/admin/refresh` triggers re-pull. No cron. | |
| Vercel Cron from day 1 | Daily cron pulls SF → Postgres. This is P2's full scope. | |
| (Other / freeform) | "Weekly job to pull data into supabase" | ✓ |

**User's choice:** Freeform — weekly cron pulling SF into Supabase.

**Notes:** Weekly is Vercel-Hobby-compatible and reduces the daily-API-quota concern, but the engineering footprint (cron handler, JWT auth, watermarks, sync_runs table, snapshot tables for Pitfall 6, error handling) is essentially the same as a daily sync. CONTEXT.md flags this as the cause of the timeline shift to ~2–3 weeks for Phase 1.

### Q4: Which Salesforce objects does Phase 1 read?

| Option | Description | Selected |
|--------|-------------|----------|
| Just Contact + Campaign + CampaignMember | Minimum for "Campaign Contribution to SQLs". | |
| Add Account + Opportunity | Five objects — enables an "engaged accounts" second chart. | |
| All 7 objects | Full P2 ingestion shape. | ✓ |

**User's choice:** All 7 objects (`Contact`, `Account`, `Campaign`, `CampaignMember`, `Opportunity`, `OpportunityContactRole`, `Presentation__c`).

### Q5: How does the Phase 1 cron authenticate to Salesforce?

| Option | Description | Selected |
|--------|-------------|----------|
| OAuth 2.0 JWT Bearer Flow | Connected App + self-signed cert + private key in Vercel env. STACK research locked. | ✓ |
| Username + password + security token | Salesforce-deprecated; will eventually break. | |
| OAuth Web Server flow with stored refresh token | Overkill for cron; no human in loop. | |

**User's choice:** OAuth 2.0 JWT Bearer Flow.

---

## Dashboard Shell Scope

### Q1: How much app shell scaffolding does Phase 1 build?

| Option | Description | Selected |
|--------|-------------|----------|
| Light shell | Sidebar + user menu only, no header indicators. | |
| Full shell with freshness indicator | Light shell + header `MAX(synced_at)` pill + methodology link placeholder. | ✓ |
| Single page only, no shell | `/dashboard/campaigns` standalone with sign-out top-right. | |

**User's choice:** Full shell with freshness indicator.

### Q2: Freshness pill thresholds for weekly sync cadence

| Option | Description | Selected |
|--------|-------------|----------|
| Weekly-tuned thresholds | Green <8d / yellow 8–15d / red >15d. PLAT-05 daily values kept as constants for later swap. | ✓ |
| Show duration only, no color coding | "Last synced 4d ago" — no green/yellow/red. | |
| Configurable via env var | `FRESHNESS_GREEN_HOURS`, `FRESHNESS_YELLOW_HOURS`. | |

**User's choice:** Weekly-tuned thresholds.

---

## Claude's Discretion

The following implementation details were left for the planner to pick:
- Exact cron schedule day/hour (planner picks low-traffic SF window; suggested `0 6 * * 0`).
- Sidebar visual identity (shadcn defaults + "Marketing BI" text — no custom logo work in P1).
- Whether `role` column lives on a `profiles` table or in `raw_user_meta_data` (planner picks based on RLS posture).
- Profile / RLS policy specifics (research locks "permissive policies for `authenticated`" given single-team posture).
- Vercel project naming, env var naming, README docs (planner picks conventional names).
- Specific copy for `/login` errors, password rules, etc.
- Whether Bulk API 2.0 vs REST `query` is used per object in P1 (research locks Bulk API 2.0 for `CampaignMember`; planner picks for the others).

---

## Deferred Ideas

These came up during the discussion but belong in later phases:

- `/admin/users` UI (Phase 6, alongside `/admin/sync`).
- Daily cron promotion + object staggering (Phase 2).
- Slack alerts on sync failure / DATA-14 (Phase 2 — was P6 in roadmap, scope shift may move to P2).
- One-shot historical backfill / DATA-15 (Phase 2 — P1 syncs go-forward only).
- Full `INVALID_FIELD` strip-and-retry resilience / DATA-12 (Phase 2 — P1 catches at object level only).
- Custom SMTP for invite emails (Phase 6 polish).
- Google SSO / AUTH-02 (Phase 6, per Pitfall 13 mitigation).
- `mart.*` materialized views + attribution math / ATTR-01..ATTR-13 (Phase 3 — P1 chart uses hand-written SQL against `raw.sf_*`).
- DASH-12 side-by-side attribution-model comparison (Phase 4).
- DASH-11 CSV export per chart (Phase 6).
- PLAT-07 mobile KPI cards fallback (Phase 6).

### ROADMAP.md updates required after this discussion

- Phase 1 success criterion #4 must be rewritten (live SF data, not seed fixture).
- Phase 1 requirements expand from `AUTH-01, AUTH-03, AUTH-04, AUTH-05, PLAT-12` to also include `DATA-01..DATA-06, DATA-09, DATA-10, DATA-11, DATA-13, DATA-15`.
- Phase 2 shrinks to "promote weekly → daily, full historical backfill, Slack alerts, `INVALID_FIELD` resilience, AUTH-06 cron-secret hardening".
- Coverage summary table re-tallies (P1: 5 → ~15 reqs; P2 shrinks accordingly).
