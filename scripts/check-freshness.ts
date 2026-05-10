import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  const rows = await sql`SELECT id, status, started_at, finished_at, row_counts FROM ops.sync_runs ORDER BY started_at DESC LIMIT 3`;
  for (const r of rows) {
    const totalRows = Object.values(r.row_counts as Record<string, { upserted: number }>).reduce((a, b) => a + (b?.upserted ?? 0), 0);
    console.log(`  ${r.status.padEnd(8)} ${r.started_at.toISOString()} → ${r.finished_at?.toISOString() ?? "(running)"}  (${totalRows} rows)`);
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
