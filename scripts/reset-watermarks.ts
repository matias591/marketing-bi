import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });
  console.log("Clearing watermarks…");
  await sql`DELETE FROM ops.watermarks`;
  console.log("Clearing raw.* (truncate cascade) so the re-sync replaces everything cleanly…");
  await sql.unsafe(`
    TRUNCATE
      raw.sf_contact, raw.sf_account, raw.sf_campaign,
      raw.sf_campaign_member, raw.sf_opportunity,
      raw.sf_opportunity_contact_role, raw.sf_presentation
    CASCADE
  `);
  await sql.end();
  console.log("Reset done.");
}
main().catch((e) => { console.error(e); process.exit(1); });
