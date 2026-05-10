import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  const matviews = await sql`
    SELECT schemaname, matviewname, hasindexes
      FROM pg_matviews WHERE schemaname = 'mart' ORDER BY matviewname
  `;
  for (const m of matviews) console.log(`  ${m.schemaname}.${m.matviewname}  (indexes: ${m.hasindexes})`);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
