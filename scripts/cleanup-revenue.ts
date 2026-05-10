import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  await sql.unsafe(`DROP MATERIALIZED VIEW IF EXISTS mart.opportunity_credit CASCADE`);
  await sql`DELETE FROM drizzle.__drizzle_migrations WHERE hash = '0003_revenue_mart'`;
  console.log("cleaned");
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
