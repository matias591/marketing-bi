import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  const t = Date.now();
  await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.opportunity_credit`);
  console.log("refreshed in", Date.now() - t, "ms");

  const stats = await sql`SELECT COUNT(*) c, COUNT(DISTINCT opportunity_id) opps, COUNT(DISTINCT campaign_id) camps, ROUND(SUM(revenue_credit)::numeric, 0) total FROM mart.opportunity_credit WHERE model='linear'`;
  console.log("Linear-model rows:", stats[0]);

  const top = await sql`
    SELECT c.name, c.type, ROUND(SUM(r.revenue_credit)::numeric, 0) revenue
      FROM raw.sf_campaign c JOIN mart.opportunity_credit r ON r.campaign_id=c.id
     WHERE r.model='linear' AND NOT c.is_deleted
     GROUP BY c.id, c.name, c.type
     HAVING SUM(r.revenue_credit) > 0
     ORDER BY revenue DESC LIMIT 10
  `;
  console.log("\nTop 10 by linear revenue:");
  for (const r of top) console.log(`  $${String(r.revenue).padStart(11)}  ${r.name}  [${r.type ?? "-"}]`);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
