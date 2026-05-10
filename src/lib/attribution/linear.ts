/**
 * Reference attribution implementation in TypeScript.
 *
 * Mirrors `mart.attribution_contact` — drives the parity test in
 * `src/lib/attribution/__tests__/attribution.test.ts` to catch drift between
 * the SQL marts and the documented methodology. Also serves as readable
 * documentation for the methodology page (`/methodology`).
 *
 * The SQL is the production query; this TS impl is the spec-as-code.
 */

export type Stage = "mql" | "sql" | "opp" | "customer";
export type Model = "first_touch" | "last_touch" | "linear";

export interface Contact {
  id: string;
  accountId: string | null;
  isDeleted: boolean;
  sqlDate: string | null; // ISO date "YYYY-MM-DD" (or null)
}

export interface Touchpoint {
  contactId: string;
  campaignId: string;
  touchpointAt: string; // ISO date
}

export interface LifecycleTransition {
  contactId: string;
  accountId: string | null;
  stage: Stage;
  transitionDate: string; // ISO date
}

export interface CreditRow {
  contactId: string;
  accountId: string | null;
  stage: Stage;
  model: Model;
  campaignId: string;
  credit: number;
  transitionDate: string;
}

const WINDOW_DAYS = 90;

/**
 * Subtract `days` days from an ISO date and return a new ISO date.
 * Pure date math; no timezone mucking — same as Postgres `date - INTERVAL '90 days'`.
 */
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute lifecycle transitions for a Contact set.
 * Mirrors mart.lifecycle_transitions — minus MQL (first Presentation),
 * Opp, and Customer dates which the test seeds directly.
 *
 * For the parity test we accept transitions explicitly so the test can
 * exercise the windowing/credit logic without re-implementing every
 * derivation rule. The SQL view does the derivation; the test agrees with
 * its outputs on a fixture.
 */
export function buildLifecycleTransitions(
  contacts: Contact[],
  perStageDates: {
    mqlDate?: Map<string, string>;
    oppDate?: Map<string, string>;
    customerDate?: Map<string, string>;
  } = {},
): LifecycleTransition[] {
  const out: LifecycleTransition[] = [];
  const stageMap: Array<[Stage, (c: Contact) => string | null | undefined]> = [
    ["mql", (c) => perStageDates.mqlDate?.get(c.id)],
    ["sql", (c) => c.sqlDate],
    ["opp", (c) => perStageDates.oppDate?.get(c.id)],
    ["customer", (c) => perStageDates.customerDate?.get(c.id)],
  ];

  for (const c of contacts) {
    if (c.isDeleted) continue;
    for (const [stage, getDate] of stageMap) {
      const dt = getDate(c);
      if (dt) out.push({ contactId: c.id, accountId: c.accountId, stage, transitionDate: dt });
    }
  }
  return out;
}

/**
 * Compute attribution credit for every (contact, stage, model, campaign).
 *
 * The window is [transitionDate - 90 days, transitionDate) — strictly less
 * than the transition (ATTR-06). All three models compute simultaneously so
 * the dashboard's model-toggle has all values pre-materialized.
 */
export function computeAttribution(
  transitions: LifecycleTransition[],
  touchpoints: Touchpoint[],
): CreditRow[] {
  // Index touchpoints by contact for fast windowing.
  const tpByContact = new Map<string, Touchpoint[]>();
  for (const tp of touchpoints) {
    if (!tpByContact.has(tp.contactId)) tpByContact.set(tp.contactId, []);
    tpByContact.get(tp.contactId)!.push(tp);
  }

  const out: CreditRow[] = [];

  for (const t of transitions) {
    const lowerBound = shiftDate(t.transitionDate, -WINDOW_DAYS);
    const inWindow = (tpByContact.get(t.contactId) ?? []).filter(
      (tp) => tp.touchpointAt < t.transitionDate && tp.touchpointAt >= lowerBound,
    );
    if (inWindow.length === 0) continue;

    // Stable ordering matches SQL: ASC for first, DESC for last; campaign_id
    // tiebreak (ASC for first, DESC for last) per the ROW_NUMBER OVER clauses.
    const sortedAsc = [...inWindow].sort((a, b) => {
      if (a.touchpointAt !== b.touchpointAt) return a.touchpointAt < b.touchpointAt ? -1 : 1;
      return a.campaignId < b.campaignId ? -1 : 1;
    });
    const sortedDesc = [...inWindow].sort((a, b) => {
      if (a.touchpointAt !== b.touchpointAt) return a.touchpointAt > b.touchpointAt ? -1 : 1;
      return a.campaignId > b.campaignId ? -1 : 1;
    });

    // Linear: 1/N to each
    const n = inWindow.length;
    for (const tp of inWindow) {
      out.push({
        contactId: t.contactId,
        accountId: t.accountId,
        stage: t.stage,
        model: "linear",
        campaignId: tp.campaignId,
        credit: round(1.0 / n, 6),
        transitionDate: t.transitionDate,
      });
    }
    // First-touch: 1.0 to earliest
    out.push({
      contactId: t.contactId,
      accountId: t.accountId,
      stage: t.stage,
      model: "first_touch",
      campaignId: sortedAsc[0].campaignId,
      credit: 1.0,
      transitionDate: t.transitionDate,
    });
    // Last-touch: 1.0 to latest
    out.push({
      contactId: t.contactId,
      accountId: t.accountId,
      stage: t.stage,
      model: "last_touch",
      campaignId: sortedDesc[0].campaignId,
      credit: 1.0,
      transitionDate: t.transitionDate,
    });
  }

  return out;
}

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}
