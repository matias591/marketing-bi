import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });

  async function time(label: string, fn: () => Promise<unknown>) {
    const t = Date.now();
    const r = await fn();
    console.log(`${label.padEnd(36)} ${Date.now() - t}ms  (${Array.isArray(r) ? r.length : "—"} rows)`);
    return r;
  }

  // Match the page default for revenue: YTD
  const fromDate = "2026-01-01";
  const toDate = "2026-05-10";

  await time("ANALYZE opportunity_credit", () => sql.unsafe(`ANALYZE mart.opportunity_credit`).then(() => []));
  await time("ANALYZE attribution_contact", () => sql.unsafe(`ANALYZE mart.attribution_contact`).then(() => []));

  await time("revenue headline", () => sql`
    SELECT
      COALESCE(SUM(r.revenue_credit), 0)::numeric AS total_revenue,
      COUNT(DISTINCT r.opportunity_id) AS opps,
      COUNT(DISTINCT r.account_id)     AS accounts,
      COUNT(DISTINCT r.contact_id)     AS contacts
    FROM raw.sf_campaign c
    JOIN mart.opportunity_credit r ON r.campaign_id = c.id
    WHERE r.model = 'linear' AND NOT c.is_deleted AND r.close_date >= ${fromDate}::date AND r.close_date <= ${toDate}::date
  `);

  await time("revenue by campaign", () => sql`
    SELECT c.id, c.name, c.type, COALESCE(SUM(r.revenue_credit),0)::numeric rev,
           COUNT(DISTINCT r.opportunity_id) opps
    FROM raw.sf_campaign c JOIN mart.opportunity_credit r ON r.campaign_id = c.id
    WHERE r.model = 'linear' AND NOT c.is_deleted AND r.close_date >= ${fromDate}::date AND r.close_date <= ${toDate}::date
    GROUP BY c.id, c.name, c.type
    HAVING SUM(r.revenue_credit) > 0
    ORDER BY rev DESC LIMIT 20
  `);

  await time("revenue by type", () => sql`
    SELECT COALESCE(c.type,'(no type)') t, COALESCE(SUM(r.revenue_credit),0)::numeric rev,
           COUNT(DISTINCT c.id) camps, COUNT(DISTINCT r.opportunity_id) opps
    FROM raw.sf_campaign c JOIN mart.opportunity_credit r ON r.campaign_id = c.id
    WHERE r.model = 'linear' AND NOT c.is_deleted AND r.close_date >= ${fromDate}::date AND r.close_date <= ${toDate}::date
    GROUP BY COALESCE(c.type,'(no type)')
    HAVING SUM(r.revenue_credit) > 0
    ORDER BY rev DESC
  `);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
