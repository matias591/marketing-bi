import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  const start = Date.now();

  console.log("Refreshing mart.lifecycle_transitions…");
  await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.lifecycle_transitions`);

  console.log("Refreshing mart.touchpoints…");
  await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.touchpoints`);

  console.log("Refreshing mart.attribution_contact…");
  await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.attribution_contact`);

  console.log("Refreshing mart.attribution_account…");
  await sql.unsafe(`REFRESH MATERIALIZED VIEW mart.attribution_account`);

  console.log(`\nDone in ${((Date.now() - start) / 1000).toFixed(1)}s\n`);

  const counts = await sql`
    SELECT
      (SELECT COUNT(*) FROM mart.lifecycle_transitions) AS transitions,
      (SELECT COUNT(*) FROM mart.touchpoints) AS touchpoints,
      (SELECT COUNT(*) FROM mart.attribution_contact) AS attribution_rows,
      (SELECT COUNT(DISTINCT contact_id) FROM mart.attribution_contact WHERE stage = 'sql') AS sql_contributors,
      (SELECT COUNT(*) FROM mart.attribution_account) AS account_rows
  `;
  console.log("Mart sizes:", counts[0]);

  const top = await sql`
    SELECT c.name, c.type, SUM(a.credit)::numeric(10,2) AS total_credit, COUNT(DISTINCT a.contact_id) AS contacts
      FROM raw.sf_campaign c
      JOIN mart.attribution_contact a ON a.campaign_id = c.id AND a.stage='sql' AND a.model='linear'
     WHERE NOT c.is_deleted
     GROUP BY c.id, c.name, c.type
     ORDER BY total_credit DESC
     LIMIT 10
  `;
  console.log("\nTop 10 campaigns by SQL credit (linear, mart-driven):");
  for (const r of top) console.log(`  ${String(r.total_credit).padStart(7)}  (${String(r.contacts).padStart(3)} contacts)  ${r.name}  [${r.type ?? '—'}]`);

  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
