/**
 * Reference attribution implementation in TypeScript.
 *
 * Mirrors `mart.attribution_contact` — drives the parity test in
 * `src/lib/attribution/__tests__/attribution.test.ts` to catch drift between
 * the SQL marts and the documented methodology.
 *
 * The SQL is the production query; this TS impl is the spec-as-code.
 *
 * Methodology (2026-05-17 business call):
 *   - Touch points: only CampaignMember rows with status Registered / Attended /
 *     Responded qualify. Invited, Email Opened, Rejected/No Response are excluded.
 *   - Window: 12 months anchored to sql_date for ALL stages. For MQL (which may
 *     predate SQL), falls back to mql_date when sql_date is null.
 *   - W-shaped model: every qualifying touch point earns 1 absolute credit point.
 *     First-touch and last-touch earn 1.0 credit to the single earliest/latest touch.
 */

export type Stage = "mql" | "sql" | "opp" | "customer";
export type Model = "w_shaped" | "first_touch" | "last_touch";

export const ATTRIBUTION_ELIGIBLE_STATUSES = new Set([
  "Registered",
  "Attended",
  "Responded",
]);

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
  sqlDate: string | null; // anchor for the 12-month window
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

/** Subtract `months` calendar months from an ISO date. */
function shiftMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute lifecycle transitions for a Contact set, propagating each Contact's
 * sqlDate so the windowing in `computeAttribution` can anchor to it.
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

  for (const c of contacts) {
    if (c.isDeleted) continue;
    const mql = perStageDates.mqlDate?.get(c.id);
    const opp = perStageDates.oppDate?.get(c.id);
    const customer = perStageDates.customerDate?.get(c.id);

    if (mql)
      out.push({ contactId: c.id, accountId: c.accountId, stage: "mql", transitionDate: mql, sqlDate: c.sqlDate });
    if (c.sqlDate)
      out.push({ contactId: c.id, accountId: c.accountId, stage: "sql", transitionDate: c.sqlDate, sqlDate: c.sqlDate });
    // Opp and Customer only emit when sql_date is known (mirror SQL behavior).
    if (opp && c.sqlDate)
      out.push({ contactId: c.id, accountId: c.accountId, stage: "opp", transitionDate: opp, sqlDate: c.sqlDate });
    if (customer && c.sqlDate)
      out.push({ contactId: c.id, accountId: c.accountId, stage: "customer", transitionDate: customer, sqlDate: c.sqlDate });
  }
  return out;
}

/**
 * Compute attribution credit for every (contact, stage, model, campaign).
 *
 * Window: [window_start, transition_date) strictly less than the transition.
 *   window_start = COALESCE(sqlDate, transitionDate) − 12 months
 *
 * W-shaped: each qualifying touch = 1.0 absolute credit point.
 * First-touch: 1.0 to the campaign with the earliest in-window touch.
 * Last-touch: 1.0 to the campaign with the latest in-window touch.
 */
export function computeAttribution(
  transitions: LifecycleTransition[],
  touchpoints: Touchpoint[],
): CreditRow[] {
  const tpByContact = new Map<string, Touchpoint[]>();
  for (const tp of touchpoints) {
    if (!tpByContact.has(tp.contactId)) tpByContact.set(tp.contactId, []);
    tpByContact.get(tp.contactId)!.push(tp);
  }

  const out: CreditRow[] = [];

  for (const t of transitions) {
    const anchor = t.sqlDate ?? t.transitionDate;
    const windowStart = shiftMonths(anchor, 12);

    const inWindow = (tpByContact.get(t.contactId) ?? []).filter(
      (tp) => tp.touchpointAt < t.transitionDate && tp.touchpointAt >= windowStart,
    );
    if (inWindow.length === 0) continue;

    const sortedAsc = [...inWindow].sort((a, b) => {
      if (a.touchpointAt !== b.touchpointAt) return a.touchpointAt < b.touchpointAt ? -1 : 1;
      return a.campaignId < b.campaignId ? -1 : 1;
    });
    const sortedDesc = [...inWindow].sort((a, b) => {
      if (a.touchpointAt !== b.touchpointAt) return a.touchpointAt > b.touchpointAt ? -1 : 1;
      return a.campaignId > b.campaignId ? -1 : 1;
    });

    // W-shaped: 1 absolute point per qualifying touch
    for (const tp of inWindow) {
      out.push({
        contactId: t.contactId,
        accountId: t.accountId,
        stage: t.stage,
        model: "w_shaped",
        campaignId: tp.campaignId,
        credit: 1.0,
        transitionDate: t.transitionDate,
      });
    }
    // First-touch
    out.push({
      contactId: t.contactId,
      accountId: t.accountId,
      stage: t.stage,
      model: "first_touch",
      campaignId: sortedAsc[0].campaignId,
      credit: 1.0,
      transitionDate: t.transitionDate,
    });
    // Last-touch
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
