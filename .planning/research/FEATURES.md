# Feature Research

**Domain:** Internal marketing-attribution BI dashboard (Salesforce-sourced, multi-touch attribution, 4–10 user team)
**Researched:** 2026-05-10
**Confidence:** MEDIUM (grounded in PROJECT.md spec + conventional BI/attribution dashboard patterns; web validation unavailable in this environment)

> **Method note.** WebSearch was denied in this run, so external validation of "what shipping attribution products do" is limited. Recommendations are derived from (a) the PROJECT.md spec, which is unambiguous about the 5 reporting goals and the 3 attribution models, and (b) conventional BI/attribution dashboard patterns from training. Confidence on individual items is annotated where it materially differs from MEDIUM.

---

## Scope Anchors (Read These First)

These three constraints from PROJECT.md drive every categorization below:

1. **View, don't author.** Users explore pre-built dashboards via filters and drill-downs; they do **not** build new charts. Anything that requires a chart-authoring surface is an anti-feature by definition.
2. **Single internal team (4–10 users).** No multi-tenancy, no per-user roles, no public sharing. Personalization at this scale should be evaluated against "could the team just agree verbally?"
3. **Daily refresh, Salesforce-only.** No real-time, no cross-source ingest. "Data freshness" surfaces matter, but they're describing a once-per-day sync — not streaming health.

The five reporting goals (G1–G5) referenced throughout:

- **G1** — Campaign Contribution to SQLs
- **G2** — Contact Journey Visibility
- **G3** — Account-Level Attribution
- **G4** — Revenue & Closed Won Attribution
- **G5** — Touchpoint Depth Analysis

Also: **P** = platform plumbing (auth, sync, navigation, etc.) — not tied to a single goal.

---

## Feature Landscape

### Table Stakes (Users Expect These)

If any of these are missing, the team will perceive the product as broken or untrustworthy — not "v1 doesn't have it yet."

| # | Feature | Maps to | Why Expected | Complexity | Notes |
|---|---------|---------|--------------|------------|-------|
| TS-1 | **Global date-range picker** affecting every chart on the active dashboard | All goals | Every BI tool has one. "What happened in Q1?" is the most common attribution question. | **S** | Standard preset list (Last 7/30/90 days, This/Last Month, This/Last Quarter, YTD, Custom range). Default to "Last 90 days." Date semantics must be explicit per dashboard (e.g., G1 filters by SQL Date, G4 by Close Date). |
| TS-2 | **Global multi-select filter bar** (campaign type, lifecycle stage, account segment if available, owner) bound to all charts | All goals | Pivot-style exploration is the user's stated workflow; without cross-chart filtering it's a static report. | **M** | Filters live in a sticky top bar, not per-chart. Multi-select with type-ahead. "Apply to all charts" is the default; per-chart override is **not** v1 scope. |
| TS-3 | **Attribution model toggle** (First-touch / Last-touch / Multi-touch linear) at dashboard scope | G1, G3, G4 | The user explicitly named all three models. Switching models is *the* core analytical action. | **M** | Single radio/segment control. Must re-aggregate every credited metric on the dashboard. Label clearly which field powers each (Original Source, Latest Source, computed linear). |
| TS-4 | **G1: Campaign-leaderboard bar chart** — SQLs per campaign, sortable, top-N truncation | G1 | "Which campaign drove the most SQLs?" is question #1. | **S** | Horizontal bars (campaign labels can be long), value labels, color-coded by campaign type. Click row → drill to TS-13. |
| TS-5 | **G1: Campaign-type rollup** — grouped/stacked bars by campaign type → SQLs | G1 | Marketers think in channel buckets (Webinar, Paid Search, Content, Event) before individual campaigns. | **S** | Same data as TS-4, grouped. Often implemented as a second tab/sub-view of the same dashboard. |
| TS-6 | **G1: Engagement-to-SQL conversion-rate funnel** | G1 | Conversion rate per campaign is the obvious complement to absolute SQL counts. The spec calls out "engagement → SQL conversion efficiency" verbatim. | **M** | Members → MQL → SQL counts per campaign. Either funnel viz or a sortable table with rate column. Table is simpler and more pivot-friendly. |
| TS-7 | **G2: Contact timeline / sequence view** — for a single Contact, ordered list of campaign touchpoints with lifecycle-stage milestones overlaid | G2 | "Show me this Contact's journey" is unanswerable in Salesforce reports without this; it's the killer drill-down. | **M** | Vertical timeline (date on Y-axis) is simpler than a horizontal swim-lane and works on mobile. Each touchpoint = campaign name + type + date; milestones (MQL/SQL/Opp/Closed) rendered as horizontal markers. |
| TS-8 | **G2: Common-journey aggregation** — for a cohort filter, which sequences of campaign types appear most often before SQL | G2 | The spec says "common patterns across successful journeys." Without aggregation, this is just N timelines. | **L** | Two reasonable v1 forms: (a) "top sequences" table — most frequent ordered campaign-type tuples leading to SQL, or (b) Sankey of campaign-type → next campaign-type → SQL. Sankey is more impressive but harder to read with >5 types. **Recommend (a) for v1, defer Sankey to v1.x.** |
| TS-9 | **G3: Account leaderboard table** — top accounts by engaged-contact count and credited revenue | G3 | "Which target accounts are we landing?" is the ABM-flavored question this dashboard exists to answer. | **S** | Sortable table: Account, # engaged contacts, # SQLs from account, Closed Won revenue, last-touch date. |
| TS-10 | **G3: Campaigns-influencing-target-accounts view** — campaigns ranked by # of accounts touched | G3 | The spec calls this out: "campaigns most influencing target accounts." | **M** | Bar chart: campaign → unique-account count. Drill into a campaign reveals account list. |
| TS-11 | **G4: Closed-Won revenue by campaign / campaign type** with attribution model toggle applied | G4 | Revenue attribution is the single highest-stakes number in the product. | **M** | Bars or sortable table with $ values. Same attribution-model toggle as TS-3 must apply. Show $ and % of total. |
| TS-12 | **G5: Touchpoint-count distribution histogram** (touchpoints to SQL, touchpoints to Closed Won) | G5 | The spec asks for "average touchpoints to SQL/Closed Won" and "touchpoint distribution." A single average is insufficient; the distribution is the insight. | **S** | Histogram with median/mean callout. Optional split by deal-size bucket as a secondary view. |
| TS-13 | **Drill-down: campaign card → influenced-contacts list** | G1, G3, G4 | After "Campaign X drove 47 SQLs," the next question is always "who?" | **S** | Click a campaign in any chart → side panel or modal listing the credited Contacts (filtered by current attribution model). Each row links to TS-14. |
| TS-14 | **Drill-down: contact card → full journey (TS-7)** | G2 | Final drill-down node. Closes the loop from "campaign drove SQLs" to "for this specific contact, here's why." | **S** | Side panel showing Contact name, Account, Lifecycle Stage, Original Source, Latest Source, plus the full timeline (TS-7). |
| TS-15 | **CSV export per chart/table** | All goals | The team will paste numbers into Slack/email/decks. CSV is the universal escape hatch. | **S** | "Download CSV" button on every chart and table. Exports the **post-filter** dataset shown on screen, not the underlying raw table. |
| TS-16 | **Last-sync timestamp visible on every dashboard** | P | Internal users will catch the product when numbers look wrong. "When was this data last refreshed?" must be one glance away. | **S** | Header chip: "Synced 4 hrs ago — 2026-05-10 06:00 UTC." Click to see sync details (TS-17). |
| TS-17 | **Sync status / error surface** — last successful sync, last failure, per-object row counts | P | A daily cron will fail occasionally. When it does, the dashboard must show stale data clearly, not lie. | **M** | Dedicated `/status` or admin page. Show: last successful sync per Salesforce object, row counts, last error message + timestamp, "stale" banner on dashboards if last sync >36h ago. |
| TS-18 | **Auth gate (Google SSO with email/password fallback)** | P | Project spec mandates it. Internal tool with Salesforce data must not be public. | **M** | Supabase Auth handles most of it. Workspace email allowlist enforced server-side, not just on the OAuth scope. |
| TS-19 | **Loading and empty states for every chart** | All goals | A chart that renders blank with no explanation is the #1 trust-killer in internal BI tools. | **S** | Skeleton loaders during fetch; empty-state copy that distinguishes "no data matches your filters" from "this campaign has zero credited contacts" from "sync hasn't run yet." |
| TS-20 | **Currency + number formatting consistent across the app** | G3, G4 | Mixed `$1234567` vs `$1,234,567` vs `$1.2M` will get flagged in the first demo. | **S** | One formatter utility. Currency follows org default (likely USD); thousands separators always on; revenue >$1M abbreviated in chart axes, full value in tooltips. |
| TS-21 | **Tooltip with raw values on every visualization** | All goals | Dense Tableau-style aesthetic implies precise values on hover. Without tooltips users will export to CSV just to read numbers. | **S** | Standard hover tooltip showing label + raw value + % of total. |

**Table-stakes complexity rollup:** mostly **S** (12) and **M** (8), one **L** (TS-8 common-journey aggregation). The L item is the biggest implementation risk in v1 and is a strong candidate to ship in a simpler form first.

### Differentiators (Competitive Advantage)

These add clear value beyond Salesforce-native reports and beyond a vanilla Tableau dashboard, but the product is not "broken" without them in v1. Sequencing depends on roadmap appetite.

| # | Feature | Maps to | Value Proposition | Complexity | Notes |
|---|---------|---------|-------------------|------------|-------|
| D-1 | **Side-by-side attribution-model comparison** for the same campaign/account/period | G1, G4 | "First-touch says Webinars are king, last-touch says Paid Search — show me both at once." This is the answer Salesforce reports literally cannot give. | **M** | Either a 3-column table (FT / LT / Linear $) or a small-multiple bar chart. **Strongest single differentiator vs Salesforce native reporting.** |
| D-2 | **Period-over-period delta indicators** on summary KPIs (this period vs prior period of same length) | All goals | "SQLs from Webinars are up 23% MoM" is what gets pasted into board updates. | **M** | Header KPI tiles with delta arrows. Auto-compute prior period from current date-range selection. |
| D-3 | **Sankey diagram for campaign-type → next-campaign-type → SQL** | G2 | Visually striking, very Tableau-esque, makes journey patterns legible without reading a table. | **L** | Worth deferring until TS-8 ships in table form first; Sankeys are read-once visuals that don't pivot well. Use a vetted lib (e.g., `@nivo/sankey`, `d3-sankey`). |
| D-4 | **Scatter / bubble: account engagement × revenue** (X = engaged contacts, Y = revenue, size = open opportunity $) | G3 | Surfaces "highly engaged but no revenue yet" outliers — the ABM action list. | **M** | Recharts scatter with hover. Quadrant overlay optional. |
| D-5 | **Saved views (named filter+date+model presets)** | All goals | At 4–10 users this *might* be overkill. But "Q4 Enterprise SQLs" as a one-click view beats 6 dropdown changes every Monday standup. | **M** | Persist to Supabase per-user. **Recommend: skip in v1, revisit after first month of use.** Anti-feature risk: each saved view is a tiny config-management problem. |
| D-6 | **Shareable URL with encoded filter state** | All goals | Cheaper version of D-5 — every dashboard URL is itself a saved view. "Ping the link" beats explaining filter selections in Slack. | **S** | Encode filters in query string (`?dateRange=last90&model=linear&campaignTypes=Webinar,Event`). Cheap to add, very high leverage at this team size. **Strongly recommend in v1.** |
| D-7 | **PDF / image export of full dashboard** | All goals | "Send me the dashboard for the QBR deck." Browser print-to-PDF is the bare minimum. | **S** for print-CSS, **M** for server-side PDF | Ship print-friendly CSS first; defer headless-Chrome PDF rendering. |
| D-8 | **Touchpoint-depth split by deal size or conversion speed** | G5 | Spec calls this out ("high-value vs low-value deals; fast vs slow conversions"). It's borderline table-stakes for G5; reclassifying as TS would also be defensible. Listed here because the basic histogram (TS-12) satisfies the goal at v1. | **M** | Faceted histograms or a small-multiple grid. Buckets need to be configurable (deal-size thresholds). |
| D-9 | **Cohort heatmap** (cohort = month-of-Contact-creation, X = months since creation, value = % reaching SQL) | G2, G5 | Standard SaaS retention chart applied to lifecycle progression. Powerful for "are recent cohorts converting faster?" | **L** | Defer past v1. Requires careful date arithmetic and cohort definition decisions. |
| D-10 | **In-app sync trigger** ("re-sync now" button on status page) | P | When numbers look wrong at 10 AM, "wait until tomorrow's cron" is unsatisfying. | **S** | Manual trigger to the same sync function. Rate-limit to prevent SF API quota hammering. |
| D-11 | **Inline data-quality flags** on charts ("8 contacts excluded: no campaign membership; 2 opportunities excluded: no Contact Role") | All goals | Internal BI's #1 credibility builder. Show the user what was thrown out and why. | **M** | Footnote/info icon under each chart. Click → modal listing excluded records with reason. |
| D-12 | **Campaign-influence matrix** (rows = campaigns, columns = lifecycle stages, cells = unique contacts touched) | G1, G2 | Dense, Tableau-shaped, answers multiple questions at once. | **M** | Heatmap table. Useful but not essential — TS-4/5 plus drill-downs cover most of the same ground. |
| D-13 | **Per-user email-summary digest** (weekly attribution snapshot) | All goals | Pushes the dashboard into the team's inbox flow. | **L** | Out of scope for v1 unless a clear weekly-meeting pattern emerges. |

### Anti-Features (Explicitly Not Building)

Categorized by why they're rejected. The first group is mandated out by PROJECT.md; the second group is bait that BI projects commonly fall into.

#### Mandated out by PROJECT.md

| Feature | Why Rejected | Alternative if Asked |
|---------|--------------|---------------------|
| **Self-service chart builder / drag-and-drop authoring** | Explicitly out of scope. The cost of "Tableau-like" is in authoring; that's the entire reason this project exists. | Add a new pre-built dashboard via code; treat dashboard layout as a first-class deployable artifact. |
| **AI / "ask your data in English"** | Explicitly out of scope for v1. Deterministic dashboards only. | None for v1. Could revisit post-PMF, but only after the deterministic dashboard set is stable. |
| **Multi-tenancy / customer-facing access** | Single internal org. No org isolation, billing, signup. | Workspace email allowlist + Supabase RLS scoped to single org_id (or no org_id at all). |
| **Non-Salesforce data sources** (GA, ad platforms, HubSpot direct, product DB) | Spec excludes them. HubSpot first/last-touch is already mirrored into SF Contact fields. | If pressure mounts later: add a single new SF object as an ingest target; do not add a new connector type. |
| **Sub-daily refresh / real-time** | Daily is sufficient at this scale. | Manual "re-sync now" button (D-10) covers the urgent case. |
| **Custom Salesforce data-model setup tooling** | The SF model (Customizable Campaign Influence, OCR, Lifecycle Stage timestamps, Presentation custom object) is already in place and not this product's responsibility. | A docs page describing the assumed SF schema, used as a precondition check during sync. |

#### BI/attribution products commonly add these — skip them

| Feature | Why It Looks Tempting | Why Skip | Alternative |
|---------|----------------------|----------|-------------|
| **Per-chart custom filters** (filter A applies only to chart X) | "More flexibility" | Doubles the filter-state UI complexity, breaks the "filter affects everything" pivot model. The team is 10 people, not 1000. | Global filters only. If a chart needs a different lens, make it a different dashboard. |
| **Per-user role-based access control** | Standard enterprise checkbox | Team is 4–10 internal marketers, all with the same data needs. RBAC is config-management overhead with no decision payoff. | Single role: "team member can sign in and see everything." |
| **Position-based / U-shaped / W-shaped / time-decay attribution models** | "Best practice" lists tout these | Spec calls for first / last / linear only. Adding more model variants without analyst demand creates "which model is correct?" arguments that the team can't resolve. | Start with the 3 specified. Add a 4th only after the team has asked specifically. |
| **Custom-attribution-model builder** (define your own weights) | Power-user feature | Authoring surface = scope creep. Same problem as the chart builder. | Hard-code the 3 models. Add a 4th in code if needed. |
| **Comments / annotations on charts** | "Collaboration" | At 10 users, Slack is the comments layer. Adding an in-app comment system is a moderation and notification problem. | Slack thread per dashboard, link in URL bar. |
| **Alerting / threshold notifications** ("ping me when SQLs from Webinar drop 20%") | Sounds proactive | Alerts on noisy daily data create more false alarms than insights at this volume. Daily refresh + small numbers = high variance. | Defer until v2 if at all. Email digest (D-13) is a softer alternative. |
| **Forecasting / predictive attribution** | "ML-powered" | Out of scope for v1; adjacent to AI exclusion. Deterministic only. | None. |
| **Goal-tracking / pacing widgets** ("60% to Q2 SQL goal") | Looks executive-friendly | Goals live in spreadsheets and change constantly. Hardcoded thresholds will be wrong by Q3. | Show absolute values; let the user mentally compare to goals. |
| **Public sharing / external embedding** | "Share with the agency" | Multi-tenancy by another name. The data is internal CRM data. | Screenshot in Slack, or PDF export (D-7). |
| **Mobile-first / native mobile app** | Cross-platform polish | Spec says desktop-primary, mobile-readable only. | Responsive layouts; no native shell. |
| **Comprehensive audit log of who-viewed-what** | Compliance reflex | Internal team, internal data, single org. Supabase auth logs are sufficient for any forensic need. | Default Supabase auth log; no custom audit trail. |
| **In-app dashboard editing UI** (rearrange tiles, hide charts) | "Personalization" | Same drag-and-drop trap as chart authoring. With 4–10 users, dashboards can be opinionated. | Ship opinionated layouts. If the team disagrees, change the code. |
| **Drag-to-zoom / brush-to-filter on time-series charts** | Cool interaction | Adds non-trivial chart-library work and isn't a primary workflow for attribution analysis (it is for time-series monitoring). | Date-range picker (TS-1) covers the same intent. |

---

## Feature Dependencies

```
[Salesforce sync (P)]
    └── powers all data-bearing features
        ├── [Attribution model toggle TS-3]
        │       └── requires both source-field-based attribution (FT/LT)
        │           AND linear-credit computation
        │               └── requires Campaign Member touchpoint stream
        │                   AND Lifecycle Stage timestamps
        │
        ├── [G1 Campaign leaderboard TS-4] ──drill──> [TS-13 Influenced contacts]
        │                                                 └── drill ──> [TS-14 Contact card]
        │                                                                  └── embeds ──> [TS-7 Timeline]
        │
        ├── [G2 Contact timeline TS-7] ──aggregates into──> [TS-8 Common journeys]
        │                                                       └── visual upgrade ──> [D-3 Sankey]
        │
        ├── [G3 Account leaderboard TS-9] ──drill──> [Account contacts list]
        │                                                 └── per-row ──> [TS-14 Contact card]
        │
        ├── [G4 Revenue attribution TS-11] ──enhances──> [D-1 Side-by-side model comparison]
        │
        └── [G5 Touchpoint histogram TS-12] ──splits into──> [D-8 By deal size / speed]
                                                  └── extends to ──> [D-9 Cohort heatmap]

[Global filter bar TS-2] ──must wire to──> All goal dashboards
    └── [D-6 Shareable URL] ──serializes──> filter state

[Last-sync indicator TS-16] ──exposes──> [TS-17 Sync status page]
                                              └── adds ──> [D-10 Manual re-sync button]

[D-11 Data-quality flags] ──surfaces──> excluded-record reasoning per chart
                                            (depends on sync recording exclusion reasons)
```

### Dependency Notes (the load-bearing ones)

- **Linear attribution depends on a campaign-member touchpoint table with creation date and lifecycle-stage timestamps on Contact.** This is the single most important data-model assumption. If sync doesn't preserve the timestamp ordering, every multi-touch number is wrong.
- **All drill-downs (TS-13, TS-14) terminate at the Contact timeline (TS-7).** TS-7 is therefore on the critical path — it's the leaf node every "tell me more" interaction lands on.
- **TS-8 (common journeys) is the highest-complexity table-stakes item and the highest-risk piece of v1.** A simpler "top campaign-type sequence table" satisfies the goal; the Sankey (D-3) is a visual upgrade, not a separate feature.
- **D-1 (side-by-side attribution) is structurally easy once TS-3 exists** — it's the same query run 3 times. Strong v1 candidate despite being labeled differentiator.
- **D-6 (shareable URLs) is cheap and replaces 80% of D-5 (saved views) value.** Build D-6, defer D-5.
- **D-11 (data-quality flags) requires the sync to record exclusion reasons.** If sync doesn't capture "why was this row dropped," D-11 becomes painful retroactively. Decide early in sync design.

---

## MVP Definition

### Launch With (v1) — the 2–4 week target

**Platform plumbing:**
- Supabase schema + daily Salesforce sync for: Contact, Account, Campaign, CampaignMember, Opportunity, OpportunityContactRole, Presentation__c
- Auth (Google SSO + email/password fallback)
- Last-sync timestamp + sync status page (TS-16, TS-17)

**Filter primitives (the pivot surface):**
- Global date-range picker (TS-1)
- Global multi-select filter bar — campaign type, lifecycle stage (TS-2)
- Attribution-model toggle (TS-3)
- Shareable URL with encoded filter state (D-6 — cheap, very high leverage)

**Goal dashboards (in this priority order):**
1. **G1 first** — campaign leaderboard (TS-4), campaign-type rollup (TS-5), conversion-rate table (TS-6). This is the loudest user need.
2. **G4 second** — Closed-Won by campaign / type with attribution-model toggle (TS-11). Highest-stakes number; pairs naturally with G1.
3. **G2 next** — Contact timeline (TS-7), common-journeys *table form* (TS-8 simpler variant). Defer Sankey.
4. **G3 next** — Account leaderboard (TS-9), campaigns-influencing-accounts (TS-10).
5. **G5 last** — touchpoint distribution histogram (TS-12). Ships with G1–G4 already in production.

**Drill-downs:**
- Campaign → contacts list (TS-13)
- Contact card with timeline (TS-14)

**Cross-cutting polish:**
- CSV export per chart (TS-15)
- Loading + empty states (TS-19)
- Consistent currency/number formatting (TS-20)
- Tooltips on every chart (TS-21)

**Recommended differentiator pulled into v1:**
- D-1 side-by-side attribution-model comparison — cheap once TS-3 is built and the strongest single argument vs Salesforce native reports.

### Add After Validation (v1.x)

- D-2 period-over-period deltas on KPI tiles
- D-4 account engagement × revenue scatter
- D-7 PDF export (print-CSS first, headless-Chrome later)
- D-8 touchpoint-depth split by deal size / speed
- D-10 manual sync trigger
- D-11 inline data-quality flags
- D-12 campaign-influence matrix
- D-3 Sankey for journey aggregation (visual upgrade of TS-8)

### Future Consideration (v2+)

- D-5 saved views — only if the team asks (D-6 likely covers it)
- D-9 cohort heatmap — requires careful cohort-definition decisions
- D-13 email-digest summaries
- 4th attribution model (position-based or time-decay) — only on explicit request
- Custom dashboard layouts / personalization — pushes back into anti-feature territory

---

## Feature Prioritization Matrix

Compact view across the whole feature set. P1 = must have for launch; P2 = soon after; P3 = future.

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| TS-1 Date-range picker | HIGH | LOW | P1 |
| TS-2 Global filter bar | HIGH | MEDIUM | P1 |
| TS-3 Attribution-model toggle | HIGH | MEDIUM | P1 |
| TS-4 G1 Campaign leaderboard | HIGH | LOW | P1 |
| TS-5 G1 Campaign-type rollup | HIGH | LOW | P1 |
| TS-6 G1 Conversion-rate funnel/table | HIGH | MEDIUM | P1 |
| TS-7 G2 Contact timeline | HIGH | MEDIUM | P1 |
| TS-8 G2 Common-journey aggregation (table form) | HIGH | HIGH | P1 |
| TS-9 G3 Account leaderboard | HIGH | LOW | P1 |
| TS-10 G3 Campaigns-influencing-accounts | MEDIUM | MEDIUM | P1 |
| TS-11 G4 Revenue by campaign / type | HIGH | MEDIUM | P1 |
| TS-12 G5 Touchpoint histogram | MEDIUM | LOW | P1 |
| TS-13 Drill: campaign → contacts | HIGH | LOW | P1 |
| TS-14 Drill: contact card + timeline | HIGH | LOW | P1 |
| TS-15 CSV export per chart | HIGH | LOW | P1 |
| TS-16 Last-sync timestamp | HIGH | LOW | P1 |
| TS-17 Sync status page | MEDIUM | MEDIUM | P1 |
| TS-18 Auth gate | HIGH | MEDIUM | P1 |
| TS-19 Loading/empty states | MEDIUM | LOW | P1 |
| TS-20 Number/currency formatting | MEDIUM | LOW | P1 |
| TS-21 Tooltips | MEDIUM | LOW | P1 |
| D-1 Side-by-side attribution comparison | HIGH | MEDIUM | P1 (recommend pulling forward) |
| D-6 Shareable URL filter state | HIGH | LOW | P1 (recommend pulling forward) |
| D-2 Period-over-period KPI deltas | HIGH | MEDIUM | P2 |
| D-4 Account engagement × revenue scatter | MEDIUM | MEDIUM | P2 |
| D-7 PDF / print export | MEDIUM | LOW (print CSS) | P2 |
| D-8 Touchpoint depth by deal size | MEDIUM | MEDIUM | P2 |
| D-10 Manual sync trigger | MEDIUM | LOW | P2 |
| D-11 Inline data-quality flags | HIGH | MEDIUM | P2 |
| D-12 Campaign-influence matrix | MEDIUM | MEDIUM | P2 |
| D-3 Journey Sankey | MEDIUM | HIGH | P2 |
| D-5 Saved views | LOW | MEDIUM | P3 |
| D-9 Cohort heatmap | MEDIUM | HIGH | P3 |
| D-13 Email digest | LOW | HIGH | P3 |

---

## Question-by-Question Answers (cross-reference)

The user asked 8 specific questions. This section maps each one to the items above so the roadmapper can trace decisions.

### 1. Filtering / slicing primitives — table stakes

- **Date range picker** (TS-1), **multi-select filter bar** (TS-2), **attribution-model toggle** (TS-3) are all table stakes.
- **Standard pattern for "filter affects all charts":** sticky top bar with filters, single global state, every chart subscribes. Per-chart filter overrides are an **anti-feature for v1** (anti-feature table). This matches Looker/Metabase/Mode's default "dashboard filters" model and avoids the per-chart-state explosion that Tableau introduces.
- **Account-segment filter:** include only if Account has a segment field in SF. If not, defer to v1.x.

### 2. Visualization choices per dashboard

| Dashboard | Recommended primary | Alternative considered | Why |
|-----------|--------------------|-----------------------|-----|
| **G1 Campaign Contribution to SQLs** | Horizontal bar leaderboard (TS-4) + grouped bars by type (TS-5) + conversion-rate table (TS-6) | Funnel viz | Bars sort and drill better than funnels; a sortable table for conversion rate is more pivot-friendly than a stylized funnel chart. |
| **G2 Contact Journey** | Vertical timeline per contact (TS-7) + top-N campaign-type sequence table (TS-8 simple) | Sankey (D-3), swim-lane | Timeline is universally readable and drill-down friendly. Sankey is the visual upgrade once the data is right. |
| **G3 Account-Level Attribution** | Account leaderboard table (TS-9) + campaigns-by-account-count bar (TS-10) | Engagement × revenue scatter (D-4) | Tables let users sort by any column — the most pivot-friendly primitive. Scatter is a great differentiator add. |
| **G4 Revenue & Closed Won** | Sortable bar chart with attribution-model toggle (TS-11) + side-by-side model comparison (D-1) | Waterfall, trended-revenue line | Waterfalls are read-once and don't pivot well. Trended revenue line is nice but not the primary attribution question. Side-by-side model comparison is the killer differentiator. |
| **G5 Touchpoint Depth** | Histogram with median/mean callout (TS-12) | Box plots, violin plots | Histograms are immediately legible; box plots require statistical literacy this team may or may not have. Optional facet by deal size (D-8). |

### 3. Drill-down patterns

- **Recommended interaction model:** **side panel** (slides in from the right, dashboard remains visible behind it).
  - Beats modal because the user keeps the dashboard context for reference while inspecting a contact.
  - Beats navigation because back-button navigation breaks the "drill several layers" workflow.
  - Beats hover-tooltip because timelines are too dense for hover.
- **Drill chain:** Chart click → side panel showing affected list (TS-13) → click row → side panel pushes to contact detail with timeline (TS-14) → "back" returns to list.
- **Confidence:** MEDIUM. This is the convention in Linear, Mixpanel, and most modern analytics SaaS, but it's worth a 30-min UX validation with one team member.

### 4. Export / sharing

- **Table stakes:** CSV per chart (TS-15) + shareable URL with filter state (D-6 — strongly recommend pulling into v1).
- **Differentiator:** PDF export (D-7) — start with print-friendly CSS, defer headless-Chrome rendering.
- **Skip:** scheduled exports, public sharing, email-attachment delivery (anti-feature for v1).

### 5. Comparison / "what changed" features

- **Period-over-period:** **differentiator**, not table stakes (D-2). Implementing well requires careful date-range arithmetic and prior-period definition. Worth shipping in v1.x, not blocking v1.
- **Campaign A vs B comparisons:** covered implicitly by sortable tables and TS-2 filters. A dedicated A-vs-B compare view is a P3.
- **Attribution-model A vs B vs C:** **D-1, recommended pulled into v1.** This is structurally cheap and the strongest single differentiator vs Salesforce reports.

### 6. Anti-features (confirmation + extensions)

- **Confirmed out of scope per PROJECT.md:** chart authoring, AI/LLM, multi-tenant, cross-source ingest, sub-daily refresh, custom SF data-model setup tooling.
- **Additional anti-features to deliberately skip** (full list in the anti-features table above): per-chart custom filters, RBAC/per-user roles, additional attribution models beyond the 3 specified, custom-attribution-model builder, in-app comments, alerting/thresholds, forecasting, goal-tracking widgets, public sharing/embedding, native mobile app, audit logging, in-app dashboard editing, brush-to-zoom on time series.
- **Reasoning theme:** every one of these adds either (a) authoring/configuration surface, (b) multi-user state, or (c) statistical complexity — none of which align with "view-only, 4–10 internal users, deterministic dashboards."

### 7. Data quality / "trust" surfaces

- **Table stakes:** last-sync timestamp on every dashboard (TS-16), sync status page with errors (TS-17), distinct empty states (TS-19).
- **Differentiator:** inline data-quality flags per chart explaining excluded records (D-11), manual sync trigger (D-10).
- **Why this matters more than usual:** internal users cross-reference these numbers against Salesforce reports. The first time the dashboard says "47 SQLs" and SF says "52," credibility is lost unless the dashboard can explain the gap. D-11 is the explicit credibility-builder.
- **Recommended v1 minimum:** TS-16 + TS-17. D-11 ideally pulled forward but acceptable in v1.x.

### 8. Saved views / personalization

- **Verdict:** **Skip in v1; revisit after the first month of use.**
- **Reasoning:** at 4–10 users, named saved views introduce a tiny config-management problem (whose view is this? who can edit?). Shareable URLs (D-6) capture ~80% of the same value at 5% of the implementation cost — every dashboard URL is itself a "saved view."
- **What would change the verdict:** if the team starts asking "can I have my own default filters when I open the dashboard?" — at that point, build a per-user default filter set, not a full saved-views CRUD.

---

## Confidence Notes

- **HIGH confidence:** mapping of features to the 5 reporting goals, anti-feature reasoning (driven directly by PROJECT.md exclusions), prioritization order within v1.
- **MEDIUM confidence:** specific visualization choices per dashboard (Sankey vs table for G2, scatter vs leaderboard for G3) — these are conventional but a quick UX check with a real marketer on the team would be cheap insurance.
- **MEDIUM confidence:** drill-down pattern (side panel) — convention-driven, worth 30-min validation.
- **LOWER confidence:** complexity estimates (S/M/L) — these assume Recharts or similar React chart lib + Supabase queries; if the stack changes, reweight.

---

## Sources

- `/Users/matiassmeke/marketing-bi/.planning/PROJECT.md` (primary source — project spec including 5 reporting goals, 3 attribution models, scope/out-of-scope, constraints)
- Conventional BI/attribution-dashboard patterns from training (Tableau, Looker, Metabase, Mode, Mixpanel-style drill-down UX, Salesforce Campaign Influence reporting). External web validation was unavailable in this run; mark for refresh if the roadmapper wants to verify specific viz conventions before committing.

---
*Feature research for: Internal marketing-attribution BI dashboard*
*Researched: 2026-05-10*
