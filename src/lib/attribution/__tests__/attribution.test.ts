/**
 * SQL ⇆ TS reference parity test (ATTR-13).
 *
 * Seeds a small fixture into raw.sf_*, runs:
 *   1. The SQL marts (REFRESH MATERIALIZED VIEW + SELECT)
 *   2. The TypeScript reference impl on the same fixture
 *
 * Asserts every (contact, stage, model, campaign, credit) row is identical.
 *
 * Run: pnpm test
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import postgres from "postgres";
import {
  buildLifecycleTransitions,
  computeAttribution,
  type Contact as TsContact,
  type Touchpoint as TsTouchpoint,
} from "../linear";

const dbUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
const skipSuite = !dbUrl;

const sql = dbUrl ? postgres(dbUrl, { prepare: false, max: 1 }) : null;

interface Fixture {
  contacts: Array<{ id: string; account_id: string | null; sql_date: string | null; is_deleted: boolean }>;
  campaigns: Array<{ id: string; name: string }>;
  campaignMembers: Array<{ id: string; contact_id: string; campaign_id: string; touchpoint: string }>;
  presentations: Array<{ id: string; contact_id: string; created: string }>;
  ocrs: Array<{ id: string; opportunity_id: string; contact_id: string }>;
  opportunities: Array<{ id: string; account_id: string | null; created: string; close: string | null; is_won: boolean }>;
}

function fixture(): Fixture {
  // Three contacts:
  //   c1 — became SQL on 2026-04-15, has 3 touchpoints in window, 1 outside
  //   c2 — became SQL on 2026-03-01, has 1 touchpoint in window
  //   c3 — soft-deleted, ignored
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
      // c1 in-window touchpoints (SQL 2026-04-15, window 2026-01-15..04-14)
      { id: "cm1".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp1".padEnd(18, "x"), touchpoint: "2026-02-01" }, // first
      { id: "cm2".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp2".padEnd(18, "x"), touchpoint: "2026-03-10" },
      { id: "cm3".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp3".padEnd(18, "x"), touchpoint: "2026-04-10" }, // last
      // c1 out-of-window touchpoint (>90 days before SQL)
      { id: "cm4".padEnd(18, "x"), contact_id: "c1".padEnd(18, "x"), campaign_id: "cmp1".padEnd(18, "x"), touchpoint: "2025-09-01" },
      // c2 in-window
      { id: "cm5".padEnd(18, "x"), contact_id: "c2".padEnd(18, "x"), campaign_id: "cmp2".padEnd(18, "x"), touchpoint: "2026-02-10" },
      // c3 (soft-deleted contact) — should be excluded
      { id: "cm6".padEnd(18, "x"), contact_id: "c3".padEnd(18, "x"), campaign_id: "cmp1".padEnd(18, "x"), touchpoint: "2026-03-01" },
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
        (id, contact_id, campaign_id, first_responded_date, created_date, is_deleted)
      VALUES
        (${cm.id}, ${cm.contact_id}, ${cm.campaign_id}, ${cm.touchpoint}::date, ${cm.touchpoint}::timestamptz, false)
      ON CONFLICT (id) DO UPDATE SET first_responded_date = EXCLUDED.first_responded_date
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

    // Pull SQL's view rows for our fixture contact ids only.
    const ids = fx.contacts.filter((c) => !c.is_deleted).map((c) => c.id);
    const sqlRows = await sql!<
      { contact_id: string; stage: string; model: string; campaign_id: string; credit: string; transition_date: Date }[]
    >`
      SELECT contact_id, stage, model, campaign_id, credit::text, transition_date
        FROM mart.attribution_contact
       WHERE contact_id = ANY(${ids})
       ORDER BY contact_id, stage, model, campaign_id
    `;

    // Run TS reference on the same fixture.
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

    // Build touchpoints (deduped by SQL's GROUP BY → minimum touchpoint per pair)
    const tpMap = new Map<string, TsTouchpoint>();
    for (const cm of fx.campaignMembers) {
      const c = fx.contacts.find((c) => c.id === cm.contact_id);
      if (!c || c.is_deleted) continue; // ATTR-12 — soft-deleted contacts excluded
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

    // Compare row counts first for fast-fail
    expect(sqlRows.length).toBe(tsRows.length);

    // Row-by-row comparison
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

  test("ATTR-01: mart.touchpoints picks the earliest CampaignMember row per pair", async () => {
    // c1 has two cmp1 CampaignMember rows: 2026-02-01 (in window) and 2025-09-01
    // (out of window). The mart.touchpoints view's MIN(touchpoint_at) picks the
    // EARLIER (out-of-window) one — cmp1 is therefore excluded from c1's SQL credit
    // entirely. c1's remaining in-window touchpoints are cmp2 and cmp3 only,
    // so linear credit at SQL = 1/2 each.
    const cmp1Rows = await sql!<{ credit: string }[]>`
      SELECT credit::text FROM mart.attribution_contact
       WHERE contact_id = ${"c1".padEnd(18, "x")}
         AND stage = 'sql' AND model = 'linear' AND campaign_id = ${"cmp1".padEnd(18, "x")}
    `;
    expect(cmp1Rows.length).toBe(0);

    const cmp2Rows = await sql!<{ credit: string }[]>`
      SELECT credit::text FROM mart.attribution_contact
       WHERE contact_id = ${"c1".padEnd(18, "x")}
         AND stage = 'sql' AND model = 'linear' AND campaign_id = ${"cmp2".padEnd(18, "x")}
    `;
    expect(cmp2Rows.length).toBe(1);
    expect(Number(cmp2Rows[0].credit)).toBeCloseTo(0.5, 5);
  });
});
