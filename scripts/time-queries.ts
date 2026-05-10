import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });

  async function time(label: string, fn: () => Promise<unknown>) {
    const t = Date.now();
    const r = await fn();
    console.log(`${label.padEnd(40)} ${Date.now() - t}ms  (${Array.isArray(r) ? r.length : "-"} rows)`);
    return r;
  }

  const where = sql`a.stage = 'sql' AND a.model = 'linear' AND NOT c.is_deleted`;

  await time("top campaigns", () => sql`
    SELECT c.id, c.name, COUNT(DISTINCT a.contact_id) sql_contacts, COALESCE(SUM(a.credit),0)::numeric total_credit
      FROM raw.sf_campaign c JOIN mart.attribution_contact a ON a.campaign_id = c.id
     WHERE ${where}
     GROUP BY c.id, c.name HAVING COUNT(DISTINCT a.contact_id) > 0
     ORDER BY total_credit DESC LIMIT 20
  `);

  await time("type rollup", () => sql`
    SELECT COALESCE(c.type,'-') t, COALESCE(SUM(a.credit),0)::numeric total_credit
      FROM raw.sf_campaign c JOIN mart.attribution_contact a ON a.campaign_id = c.id
     WHERE ${where}
     GROUP BY COALESCE(c.type,'-') HAVING COUNT(DISTINCT a.contact_id) > 0
     ORDER BY total_credit DESC
  `);

  await time("conversion rate", () => sql`
    WITH engaged AS (
      SELECT t.campaign_id, COUNT(DISTINCT t.contact_id) n
        FROM mart.touchpoints t
        JOIN raw.sf_contact ct ON ct.id = t.contact_id
        JOIN raw.sf_campaign c  ON c.id  = t.campaign_id
       WHERE NOT ct.is_deleted AND NOT c.is_deleted
       GROUP BY t.campaign_id
    ),
    contributors AS (
      SELECT a.campaign_id, COUNT(DISTINCT a.contact_id) n
        FROM mart.attribution_contact a
        JOIN raw.sf_contact ct ON ct.id = a.contact_id
        JOIN raw.sf_campaign c  ON c.id  = a.campaign_id
       WHERE ${where}
       GROUP BY a.campaign_id
    )
    SELECT c.id, c.name, e.n engaged, COALESCE(s.n,0) contrib
      FROM raw.sf_campaign c JOIN engaged e ON e.campaign_id = c.id
      LEFT JOIN contributors s ON s.campaign_id = c.id
     WHERE NOT c.is_deleted ORDER BY (COALESCE(s.n,0)::float / e.n) DESC LIMIT 50
  `);

  await time("available types", () => sql`
    SELECT DISTINCT type FROM raw.sf_campaign WHERE NOT is_deleted AND type IS NOT NULL ORDER BY type
  `);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
