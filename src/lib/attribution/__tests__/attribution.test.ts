/**
 * SQL ⇆ TS reference parity test (ATTR-13).
 *
 * Seeds a small fixture into raw.sf_*, runs:
 *   1. The SQL marts (REFRESH MATERIALIZED VIEW + SELECT)
 *   2. The TypeScript reference impl (wshape.ts) on the same fixture
 *
 * Asserts every (contact, stage, model, campaign, credit) row is identical.
 *
 * Methodology under test (2026-05-17):
 *   - Status filter: only Registered / Attended / Responded qualify
 *   - Window: 12 months anchored to sql_date
 *   - W-shaped model: 1.0 credit per qualifying touch
 *
 * Run: pnpm test
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import {
  buildLifecycleTransitions,
  computeAttribution,
  ATTRIBUTION_ELIGIBLE_STATUSES,
  type Contact as TsContact,
  type Touchpoint as TsTouchpoint,
} from "../wshape";

const dbUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const skipSuite = !dbUrl;

const sql = dbUrl ? postgres(dbUrl, { prepare: false, max: 1 }) : null;

interface Fixture {
  contacts: Array<{ id: string; account_id: string | null; sql_date: string | null; is_deleted: boolean }>;
  campaigns: Array<{ id: string; name: string }>;
  campaignMembers: Array<{
    id: string;
    contact_id: string;
    campaign_id: string;
    touchpoint: string;
    status: string; // Registered | Attended | Responded | Invited | Rejected
  }>;
  presentations: Array<{ id: string; contact_id: string; created: string }>;
  ocrs: Array<{ id: string; opportunity_id: string; contact_id: string }>;
  opportunities: Array<{ id: string; account_id: string | null; created: string; close: string | null; is_won: boolean }>;
}

function fixture(): Fixture {
  // Three contacts:
  //   c1 — became SQL on 2026-04-15, has 3 eligible in-window touchpoints,
  //         1 out-of-window, and 1 Invited (excluded by status)
  //   c2 — became SQL on 2026-03-01, has 1 eligible touchpoint in window
  //   c3 — soft-deleted, ignored
  // Window: 12 months before sql_date (not 90 days).
  return {
    contacts: [
      { id: "c1".padEnd(18, "x"), account_id: "a1".padEnd(18, "x"), sql_date: "2026-04-15", is_deleted: false },
      { id: "c2".padEnd(18, "x"), account_id: "a1".padEnd(18, "x"), sql_date: "2026-03-01", is_deleted: false },
      { id: "c3".padEnd(18, "x"), account_id: "a2".padEnd(18, "x"), sql_date: "2026-04-01", is_deleted: true },
    ],
    campaigns: [
      { id: "cmp1".padEnd(18, "x"), name: "Campaign A" },
      { id: "cmp2".padEnd(18, "x"), name: "Campaign B" },
      { id: "cmp3".padEnd(18, "x"), name: "Campaign C" },
    ],
    campaignMembers: [
      // c1 in-window, eligible (SQL 2026-04-15, window 2025-04-15..2026-04-14)
      { id: "cm1".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp1".padEnd(18, "x"), touchpoint: "2026-02-01", status: "Registered" }, // first
      { id: "cm2".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp2".padEnd(18, "x"), touchpoint: "2026-03-10", status: "Attended" },
      { id: "cm3".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp3".padEnd(18, "x"), touchpoint: "2026-04-10", status: "Responded" }, // last
      // c1 out-of-window (>12 months before SQL 2026-04-15 → before 2025-04-15)
      { id: "cm4".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp1".padEnd(18, "x"), touchpoint: "2025-01-01", status: "Registered" },
      // c1 Invited — excluded by status filter
      { id: "cm5".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp2".padEnd(18, "x"), touchpoint: "2025-12-01", status: "Invited" },
      // c2 in-window, eligible (SQL 2026-03-01, window 2025-03-01..2026-02-28)
      { id: "cm6".padEnd(18, "x"), contact_id: "c2".padEnd(18, "x"), campaign_id: "cmp2".padEnd(18, "x"), touchpoint: "2026-02-10", status: "Registered" },
      // c3 (soft-deleted contact) — excluded regardless of status
      { id: "cm7".padEnd(18, "x"), contact_id: "c3".padEnd(18, "x"), campaign_id: "cmp1".padEnd(18, "x"), touchpoint: "2026-03-01", status: "Registered" },
    ],
    presentations: [
      // c1's first presentation = 2026-04-10 (defines mql_date)
      { id: "p1".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), created: "2026-04-10" },
    ],
    ocrs: [],
    opportunities: [],
  };
}

async function seed(fx: Fixture, sqlClient: postgres.Sql) {
  await sqlClient.unsafe(`
    DELETE FROM raw.sf_campaign_member WHERE id = ANY(${sqlIdArr(fx.campaignMembers.map((m) => m.id))});
    DELETE FROM raw.sf_presentation    WHERE id = ANY(${sqlIdArr(fx.presentations.map((p) => p.id))});
    DELETE FROM raw.sf_campaign        WHERE id = ANY(${sqlIdArr(fx.campaigns.map((c) => c.id))});
    DELETE FROM raw.sf_contact         WHERE id = ANY(${sqlIdArr(fx.contacts.map((c) => c.id))});
  `);

  for (const c of fx.contacts) {
    await sqlClient`
      INSERT INTO raw.sf_contact (id, account_id, sql_date, is_deleted)
      VALUES (${c.id}, ${c.account_id}, ${c.sql_date}::date, ${c.is_deleted})
      ON CONFLICT (id) DO UPDATE SET sql_date = EXCLUDED.sql_date, is_deleted = EXCLUDED.is_deleted
    `;
  }
  for (const c of fx.campaigns) {
    await sqlClient`
      INSERT INTO raw.sf_campaign (id, name) VALUES (${c.id}, ${c.name})
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `;
  }
  for (const cm of fx.campaignMembers) {
    await sqlClient`
      INSERT INTO raw.sf_campaign_member
        (id, contact_id, campaign_id, status, first_responded_date, created_date, is_deleted)
      VALUES
        (${cm.id}, ${cm.contact_id}, ${cm.campaign_id}, ${cm.status},
         ${cm.touchpoint}::date, ${cm.touchpoint}::timestamptz, false)
      ON CONFLICT (id) DO UPDATE
        SET first_responded_date = EXCLUDED.first_responded_date,
            status               = EXCLUDED.status
    `;
  }
  for (const p of fx.presentations) {
    await sqlClient`
      INSERT INTO raw.sf_presentation (id, contact_id, created_date, is_deleted)
      VALUES (${p.id}, ${p.contact_id}, ${p.created}::timestamptz, false)
      ON CONFLICT (id) DO UPDATE SET created_date = EXCLUDED.created_date
    `;
  }
}

function sqlIdArr(ids: string[]) {
  return `ARRAY[${ids.map((i) => `'${i}'`).join(",")}]::varchar[]`;
}

(skipSuite ? describe.skip : describe)("SQL ⇆ TS attribution parity", () => {
  beforeAll(async () => {
    if (!sql) return;
    await seed(fixture(), sql);
    await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.lifecycle_transitions;`);
    await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.touchpoints;`);
    await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.attribution_contact;`);
    await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.attribution_account;`);
  }, 60000);

  afterAll(async () => {
    await sql?.end();
  });

  test("attribution_contact rows match TS reference", async () => {
    const fx = fixture();

    const ids = fx.contacts.filter((c) => !c.is_deleted).map((c) => c.id);
    const sqlRows = await sql!<
      { contact_id: string; stage: string; model: string; campaign_id: string; credit: string; transition_date: Date }[]
    >`
      SELECT contact_id, stage, model, campaign_id, credit::text, transition_date
        FROM mart.attribution_contact
       WHERE contact_id = ANY(${ids})
       ORDER BY contact_id, stage, model, campaign_id
    `;

    const tsContacts: TsContact[] = fx.contacts.map((c) => ({
      id: c.id,
      accountId: c.account_id,
      isDeleted: c.is_deleted,
      sqlDate: c.sql_date,
    }));
    const mqlDateMap = new Map<string, string>();
    for (const p of fx.presentations) {
      const cur = mqlDateMap.get(p.contact_id);
      if (!cur || p.created < cur) mqlDateMap.set(p.contact_id, p.created.slice(0, 10));
    }
    const transitions = buildLifecycleTransitions(tsContacts, { mqlDate: mqlDateMap });

    // Build touchpoints: apply both soft-delete filter (ATTR-12) and status filter
    const tpMap = new Map<string, TsTouchpoint>();
    for (const cm of fx.campaignMembers) {
      const c = fx.contacts.find((c) => c.id === cm.contact_id);
      if (!c || c.is_deleted) continue;
      if (!ATTRIBUTION_ELIGIBLE_STATUSES.has(cm.status)) continue; // status filter
      const key = `${cm.contact_id}|${cm.campaign_id}`;
      const cur = tpMap.get(key);
      if (!cur || cm.touchpoint < cur.touchpointAt) {
        tpMap.set(key, { contactId: cm.contact_id, campaignId: cm.campaign_id, touchpointAt: cm.touchpoint });
      }
    }
    const touchpoints = Array.from(tpMap.values());

    const tsRows = computeAttribution(transitions, touchpoints).sort((a, b) => {
      const k = (r: { contactId: string; stage: string; model: string; campaignId: string }) =>
        `${r.contactId}|${r.stage}|${r.model}|${r.campaignId}`;
      return k(a).localeCompare(k(b));
    });

    expect(sqlRows.length).toBe(tsRows.length);

    for (let i = 0; i < sqlRows.length; i++) {
      const s = sqlRows[i];
      const t = tsRows[i];
      expect({
        contact_id: s.contact_id,
        stage: s.stage,
        model: s.model,
        campaign_id: s.campaign_id,
        credit: Number(s.credit),
      }).toEqual({
        contact_id: t.contactId,
        stage: t.stage,
        model: t.model,
        campaign_id: t.campaignId,
        credit: Number(t.credit.toFixed(6)),
      });
    }
  });

  test("soft-deleted contact gets zero rows in attribution_contact", async () => {
    const deletedId = "c3".padEnd(18, "x");
    const rows = await sql!`
      SELECT 1 FROM mart.attribution_contact WHERE contact_id = ${deletedId} LIMIT 1
    `;
    expect(rows.length).toBe(0);
  });

  test("Invited status is excluded from mart.touchpoints", async () => {
    // cm5 is 'Invited' for c1/cmp2 on 2025-12-01. mart.touchpoints must not include it.
    // cmp2 should still appear via cm2 (Attended, 2026-03-10).
    const rows = await sql!<{ touchpoint_at: string }[]>`
      SELECT touchpoint_at::text FROM mart.touchpoints
       WHERE contact_id  = ${"c1".padEnd(18, "x")}
         AND campaign_id = ${"cmp2".padEnd(18, "x")}
    `;
    expect(rows.length).toBe(1);
    // Should be the Attended touch (2026-03-10), NOT the Invited touch (2025-12-01)
    expect(rows[0].touchpoint_at).toBe("2026-03-10");
  });

  test("out-of-window touch excluded (>12 months before SQL)", async () => {
    // cm4: c1/cmp1, 2025-01-01 — more than 12 months before SQL 2026-04-15
    // cmp1 should still appear via cm1 (Registered, 2026-02-01, in window).
    const rows = await sql!<{ credit: string }[]>`
      SELECT credit::text FROM mart.attribution_contact
       WHERE contact_id  = ${"c1".padEnd(18, "x")}
         AND stage = 'sql' AND model = 'w_shaped'
         AND campaign_id = ${"cmp1".padEnd(18, "x")}
    `;
    expect(rows.length).toBe(1);
    expect(Number(rows[0].credit)).toBe(1.0);
  });

  test("w_shaped model: each qualifying touch earns exactly 1.0 credit", async () => {
    // c1 has 3 in-window eligible touches (cmp1, cmp2, cmp3) → each = 1.0
    const c1SqlRows = await sql!<{ campaign_id: string; credit: string }[]>`
      SELECT campaign_id, credit::text
        FROM mart.attribution_contact
       WHERE contact_id = ${"c1".padEnd(18, "x")}
         AND stage = 'sql' AND model = 'w_shaped'
       ORDER BY campaign_id
    `;
    expect(c1SqlRows.length).toBe(3);
    for (const r of c1SqlRows) {
      expect(Number(r.credit)).toBe(1.0);
    }
  });
});
