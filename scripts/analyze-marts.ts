import postgres from "postgres";
async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  for (const mart of [
    "mart.lifecycle_transitions",
    "mart.touchpoints",
    "mart.attribution_contact",
    "mart.attribution_account",
    "mart.opportunity_credit",
  ]) {
    const t = Date.now();
    await sql.unsafe(`ANALYZE ${mart}`);
    console.log(`ANALYZE ${mart.padEnd(40)} ${Date.now() - t}ms`);
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
