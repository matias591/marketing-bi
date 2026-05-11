import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  const t = Date.now();
  const sqlRows = await sql`
    SELECT c.id AS contact_id, COUNT(DISTINCT t.campaign_id) AS n
      FROM raw.sf_contact c
      JOIN mart.touchpoints t ON t.contact_id = c.id
      JOIN raw.sf_campaign camp ON camp.id = t.campaign_id
     WHERE NOT c.is_deleted AND NOT camp.is_deleted AND c.sql_date IS NOT NULL
       AND t.touchpoint_at <  c.sql_date AND t.touchpoint_at >= c.sql_date - INTERVAL '90 days'
     GROUP BY c.id
  `;
  const customerRows = await sql`
    SELECT c.id AS contact_id, COUNT(DISTINCT t.campaign_id) AS n
      FROM raw.sf_contact c JOIN mart.lifecycle_transitions lt ON lt.contact_id = c.id
      JOIN mart.touchpoints t ON t.contact_id = c.id
      JOIN raw.sf_campaign camp ON camp.id = t.campaign_id
     WHERE NOT c.is_deleted AND NOT camp.is_deleted AND lt.customer_date IS NOT NULL
       AND t.touchpoint_at <  lt.customer_date AND t.touchpoint_at >= lt.customer_date - INTERVAL '90 days'
     GROUP BY c.id
  `;
  const sqlCounts = (sqlRows as unknown as Array<{ n: string }>).map(r => Number(r.n));
  const custCounts = (customerRows as unknown as Array<{ n: string }>).map(r => Number(r.n));
  const mean = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
  const med = (xs: number[]) => { if (xs.length===0) return 0; const s=[...xs].sort((a,b)=>a-b); const m=Math.floor(s.length/2); return s.length%2===0?(s[m-1]+s[m])/2:s[m]; };
  console.log(`Queries: ${Date.now()-t}ms`);
  console.log(`SQL stage: ${sqlCounts.length} contacts, mean=${mean(sqlCounts).toFixed(1)}, median=${med(sqlCounts).toFixed(1)}`);
  console.log(`Customer stage: ${custCounts.length} contacts, mean=${mean(custCounts).toFixed(1)}, median=${med(custCounts).toFixed(1)}`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
