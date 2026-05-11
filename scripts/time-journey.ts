import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  async function time(label: string, fn: () => Promise<unknown>) {
    const t = Date.now();
    const r = await fn();
    console.log(`${label.padEnd(36)} ${Date.now() - t}ms  (${Array.isArray(r) ? r.length : "-"} rows)`);
    return r;
  }
  await time("common-journey aggregation", () => sql`
    WITH windowed AS (
      SELECT c.id contact_id, c.sql_date, t.campaign_id, camp.type campaign_type, t.touchpoint_at,
             ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.touchpoint_at ASC,  t.campaign_id ASC)  rn_first,
             ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.touchpoint_at DESC, t.campaign_id DESC) rn_last
        FROM raw.sf_contact c
        JOIN mart.touchpoints t ON t.contact_id = c.id
        JOIN raw.sf_campaign camp ON camp.id = t.campaign_id
       WHERE NOT c.is_deleted AND c.sql_date IS NOT NULL AND camp.type IS NOT NULL
         AND t.touchpoint_at <  c.sql_date AND t.touchpoint_at >= c.sql_date - INTERVAL '90 days'
    ),
    firsts AS (SELECT contact_id, campaign_type AS first_type FROM windowed WHERE rn_first = 1),
    lasts AS  (SELECT contact_id, campaign_type AS last_type  FROM windowed WHERE rn_last  = 1)
    SELECT f.first_type, l.last_type, COUNT(*) c
      FROM firsts f JOIN lasts l ON l.contact_id = f.contact_id
     GROUP BY f.first_type, l.last_type ORDER BY c DESC LIMIT 15
  `);
  const journeys = await sql`
    WITH windowed AS (
      SELECT c.id contact_id, c.sql_date, t.campaign_id, camp.type campaign_type, t.touchpoint_at,
             ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.touchpoint_at ASC,  t.campaign_id ASC)  rn_first,
             ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY t.touchpoint_at DESC, t.campaign_id DESC) rn_last
        FROM raw.sf_contact c
        JOIN mart.touchpoints t ON t.contact_id = c.id
        JOIN raw.sf_campaign camp ON camp.id = t.campaign_id
       WHERE NOT c.is_deleted AND c.sql_date IS NOT NULL AND camp.type IS NOT NULL
         AND t.touchpoint_at <  c.sql_date AND t.touchpoint_at >= c.sql_date - INTERVAL '90 days'
    ),
    firsts AS (SELECT contact_id, campaign_type AS first_type FROM windowed WHERE rn_first = 1),
    lasts AS  (SELECT contact_id, campaign_type AS last_type  FROM windowed WHERE rn_last  = 1)
    SELECT f.first_type, l.last_type, COUNT(*) c
      FROM firsts f JOIN lasts l ON l.contact_id = f.contact_id
     GROUP BY f.first_type, l.last_type ORDER BY c DESC LIMIT 10
  `;
  console.log("\nTop journey pairs:");
  for (const r of journeys as unknown as Array<{ first_type: string; last_type: string; c: string }>) {
    console.log(`  ${r.c.padStart(3)}  ${r.first_type}  →  ${r.last_type}`);
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
