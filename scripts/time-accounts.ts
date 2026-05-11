import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  async function time(label: string, fn: () => Promise<unknown>) {
    const t = Date.now();
    const r = await fn();
    console.log(`${label.padEnd(40)} ${Date.now() - t}ms  (${Array.isArray(r) ? r.length : "-"} rows)`);
    return r;
  }
  const fromDate = "2026-01-01";
  const toDate = "2026-05-11";
  const leaderboard = await time("account leaderboard", () => sql`
    WITH engaged AS (
      SELECT ct.account_id, COUNT(DISTINCT ct.id) AS n
        FROM raw.sf_contact ct
        JOIN mart.touchpoints t ON t.contact_id = ct.id
        JOIN raw.sf_campaign c  ON c.id = t.campaign_id
       WHERE NOT ct.is_deleted AND NOT c.is_deleted AND ct.account_id IS NOT NULL
       GROUP BY ct.account_id
    ),
    sql_contacts AS (
      SELECT ct.account_id, COUNT(DISTINCT ct.id) AS n
        FROM raw.sf_contact ct
       WHERE NOT ct.is_deleted AND ct.sql_date IS NOT NULL AND ct.account_id IS NOT NULL
         AND ct.sql_date >= ${fromDate}::date AND ct.sql_date <= ${toDate}::date
       GROUP BY ct.account_id
    ),
    revenue AS (
      SELECT oc.account_id, SUM(oc.revenue_credit) AS r
        FROM mart.opportunity_credit oc
        JOIN raw.sf_campaign c ON c.id = oc.campaign_id
       WHERE oc.model='linear' AND NOT c.is_deleted
         AND oc.close_date >= ${fromDate}::date AND oc.close_date <= ${toDate}::date
       GROUP BY oc.account_id
    ),
    last_touch AS (
      SELECT ct.account_id, MAX(t.touchpoint_at) AS lt
        FROM raw.sf_contact ct
        JOIN mart.touchpoints t ON t.contact_id = ct.id
       WHERE NOT ct.is_deleted AND ct.account_id IS NOT NULL
       GROUP BY ct.account_id
    )
    SELECT a.id, a.name, COALESCE(e.n,0) eng, COALESCE(sc.n,0) sqls, COALESCE(r.r,0) rev, lt.lt
    FROM raw.sf_account a
    LEFT JOIN engaged     e  ON e.account_id  = a.id
    LEFT JOIN sql_contacts sc ON sc.account_id = a.id
    LEFT JOIN revenue     r  ON r.account_id  = a.id
    LEFT JOIN last_touch  lt ON lt.account_id = a.id
    WHERE NOT a.is_deleted
      AND (COALESCE(e.n,0)>0 OR COALESCE(sc.n,0)>0 OR COALESCE(r.r,0)>0)
    ORDER BY rev DESC, sqls DESC, eng DESC LIMIT 100
  `);
  console.log("Top 5 accounts:");
  for (const r of (leaderboard as unknown as Array<{ name: string | null; eng: string; sqls: string; rev: string; lt: Date | string | null }>).slice(0, 5)) {
    console.log(`  ${(r.name ?? "—").padEnd(40)} eng=${r.eng}  sqls=${r.sqls}  rev=$${Number(r.rev).toFixed(0)}`);
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
