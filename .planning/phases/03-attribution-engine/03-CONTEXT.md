# Phase 3: Attribution Engine - Context

**Gathered:** 2026-05-10
**Status:** Ready for execution

<domain>
## Phase Boundary

Build the attribution marts (`mart.touchpoints`, `mart.attribution_contact`, `mart.attribution_account`) that compute **first-touch**, **last-touch**, and **linear multi-touch** attribution credit per (Contact, Campaign) pair, **independently at each lifecycle stage** (MQL / SQL / Opp / Customer). Replace `/dashboard/campaigns`'s hand-written SQL with a mart-backed query. Ship the methodology page that documents every rule and known divergence from Salesforce native reports — this is the "marketing director can trust the numbers" milestone.

**In scope:**
- `mart.lifecycle_transitions` — derived per-stage transition dates per Contact (see decisions below)
- `mart.touchpoints` — deduped (contact_id, campaign_id) with COALESCE(first_responded_date, created_date) timestamp
- `mart.attribution_contact` — per-stage credit at MQL/SQL/Opp/Customer for first/last/linear models
- `mart.attribution_account` — `GROUP BY account_id` rollup
- `lib/attribution/linear.ts` — TypeScript reference implementation
- `__tests__/attribution.test.ts` — Vitest parity test (SQL == TS on seeded fixture)
- `/methodology` page (replaces stub; reachable from dashboard header)
- Mart refresh wired into cron (REFRESH MATERIALIZED VIEW CONCURRENTLY after raw load)
- Switch `/dashboard/campaigns` to read from `mart.attribution_contact`

**Out of scope (deferred):**
- Position-based / time-decay attribution (v2: ATTR-V2-01, ATTR-V2-02)
- OCR Role weighting beyond equal split (v2: ATTR-V2-03)
- Daily cron promotion + Slack alerts + backfill (Phase 2 polish)
- Other dashboards (Phase 4–6)

</domain>

<decisions>
## Implementation Decisions

### Lifecycle transition dates (the key decision)

The org doesn't have MQL_Date / Opportunity_Date / Customer_Date as custom fields on Contact. Derive each from the data we already pull:

- **MQL_Date** = `MIN(raw.sf_presentation.created_date)` per Contact (joining `Presentation__c.Primary_Contract__c → Contact.id`). Earliest BDR meeting.
- **SQL_Date** = `raw.sf_contact.sql_date` (custom field `SQL_Date__c`). Already populated by SF trigger when a Presentation is created.
- **Opp_Date** = `MIN(raw.sf_opportunity.created_date)` joined to Contact via `raw.sf_opportunity_contact_role.contact_id`. Earliest Opportunity the Contact participates on.
- **Customer_Date** = `MIN(raw.sf_opportunity.close_date WHERE is_won = true)` joined to Contact via OCR. Earliest Closed Won deal.

**Known divergence** (must appear on methodology page): MQL and SQL collapse to the same date for Contacts whose first SF activity was a BDR-created Presentation (the SF trigger flips Lifecycle to SQL when a Presentation is created). For Contacts who reached MQL through other channels first, the dates differ. Phase 3 doesn't differentiate "MQL via marketing" vs "MQL via Presentation"; that's a future refinement.

### Methodology rules (locked from REQUIREMENTS.md ATTR-01..ATTR-13)

- **Window**: 90 days strictly before the lifecycle transition date (`<`, not `<=` — ATTR-06).
- **Touchpoint dedupe**: one row per `(contact_id, campaign_id)` in `mart.touchpoints`; keep the earliest CampaignMember row (`MIN(COALESCE(first_responded_date, created_date::date))`).
- **CampaignMember statuses included**: ALL — including `Sent` (ATTR-05). Not filtered to `Responded`.
- **Per-stage independence**: Contact at SQL stage gets credit; same Contact at Opp stage gets a separate credit; Customer stage another. No "single bucket" (ATTR-07).
- **Soft-delete filter**: `WHERE NOT raw.sf_contact.is_deleted` on every attribution query (ATTR-10).
- **OCR Closed Won split**: equal among all OpportunityContactRole Contacts on each Opportunity (ATTR-11).
- **First/last source**: read from `ops.contact_source_history` as-of the lifecycle transition date (ATTR-02, ATTR-03). Fallback: if no snapshot exists for the transition date (because our cron started after the transition), use the earliest snapshot we have, OR the current value from `raw.sf_contact` as a last resort. Note this fallback in the methodology page.

### Account-as-of-event (ATTR-09)

Phase 1's `ops.contact_source_history` doesn't snapshot `account_id`. For v1 of `mart.attribution_account`, use the **current** `account_id` from `raw.sf_contact`. **Document this as a known divergence**: a Contact who switched Accounts gets their historical attribution credit re-attributed to their current Account. Future improvement: add `account_id` to the contact_source_history snapshot table (next sync forward) — past divergence remains permanent. Not blocking for Phase 3.

### Materialized view design

- All marts are **materialized views** (not regular views) so dashboard reads are fast and `REFRESH ... CONCURRENTLY` keeps them queryable during refresh.
- **Unique index required** on each mart for `CONCURRENTLY` to work. Indexes documented in the migration.
- **Refresh trigger**: at the end of every sync run in `/api/cron/sync` after raw upserts complete and before the route returns. Concurrent refresh blocks if a previous refresh is still running; that's fine for weekly sync.

### TypeScript reference implementation (ATTR-13)

`src/lib/attribution/linear.ts` re-implements the same math as SQL:
- Inputs: list of contacts with their transition dates, list of touchpoints, list of OCRs.
- Outputs: identical schema to `mart.attribution_contact`.
- The Vitest parity test seeds `raw.sf_*` fixtures, runs both implementations, asserts equal credit per (contact, campaign, stage, model).

Reference implementation exists for two reasons:
1. **Verification** — catches drift between SQL and intent during refactors.
2. **Documentation** — readable code that mirrors the methodology page; easier to debug than SQL window functions when explaining to non-engineers.

### Methodology page sign-off

The "marketing director sign-off" requirement (ATTR-13) is interpreted as: the page exists and documents every locked rule + every known divergence. Sign-off happens out-of-band (Slack, in-person) — not encoded in the system. The page header includes a "Last updated" date and a link to the git commit so changes are auditable.

</decisions>

<canonical_refs>
## Canonical References

### Phase 3 anchors
- `.planning/REQUIREMENTS.md` §ATTR (ATTR-01..ATTR-13) — the locked methodology rules.
- `.planning/research/PITFALLS.md` — Pitfalls 7 (unbounded multi-touch), 8 (SF reconciliation), 11 (CampaignMember dupes), 12 (soft-deletes), 18 (off-by-one transition boundary), 19 (lifecycle stage double-counting), 20 (account reassignment), 21 (multi-OCR Closed Won credit).
- `.planning/research/ARCHITECTURE.md` — `raw / stage / mart` schema layout, refresh patterns.
- `.planning/phases/01-vertical-slice-auth-foundation/01-CONTEXT.md` — Phase 1 context. Tells you what's in `raw.sf_*` and `ops.*` already.

### Phase 3 outputs that future phases reference
- `mart.attribution_contact` and `mart.attribution_account` — read by Phases 4, 5, 6 dashboards.
- `lib/attribution/linear.ts` — re-used as documentation in the methodology page.
- `/methodology` — linked from every dashboard header (Phase 4 onward).

</canonical_refs>

<deferred>
## Deferred Ideas

- **Account-as-of-event snapshot** (ATTR-09 strict reading) — requires `account_id` in `ops.contact_source_history`. Phase 4 or revisit if cross-account contact reassignment becomes a real problem.
- **MQL via marketing vs Presentation differentiation** — currently MQL_Date ≈ SQL_Date for many Contacts. Phase 4+ once we have visibility into what the marketing team needs.
- **Field History Tracking on Lifecycle_Stage__c** — would give true historical transition dates without our derivations. Requires SF setup change. Revisit if our derivations diverge from SF reports too much.
- **Sankey diagram** for Common-journey aggregation (DASH-06) — table-only in v1; Sankey deferred to v1.x.

</deferred>

---

*Phase: 03-attribution-engine*
*Context gathered: 2026-05-10*
