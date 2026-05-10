import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DIRECT_DATABASE_URL!, { prepare: false, max: 1 });

  const counts = await sql`
    SELECT
      (SELECT COUNT(*) FROM raw.sf_contact WHERE NOT is_deleted) AS contacts,
      (SELECT COUNT(*) FROM raw.sf_contact WHERE NOT is_deleted AND sql_date IS NOT NULL) AS sql_contacts,
      (SELECT COUNT(*) FROM raw.sf_campaign WHERE NOT is_deleted) AS campaigns,
      (SELECT COUNT(*) FROM raw.sf_campaign_member WHERE NOT is_deleted) AS members
  `;
  console.log("Counts:", counts[0]);

  const rows = await sql`
    WITH valid_contacts AS (
      SELECT id, sql_date FROM raw.sf_contact
      WHERE NOT is_deleted AND sql_date IS NOT NULL
    ),
    valid_members AS (
      SELECT cm.contact_id, cm.campaign_id,
             COALESCE(cm.first_responded_date, cm.created_date::date) AS touchpoint_at
      FROM raw.sf_campaign_member cm
      WHERE NOT cm.is_deleted AND cm.contact_id IS NOT NULL
    ),
    credited AS (
      SELECT DISTINCT vm.campaign_id, vm.contact_id
      FROM valid_members vm
      JOIN valid_contacts vc ON vc.id = vm.contact_id
      WHERE vm.touchpoint_at < vc.sql_date
    )
    SELECT c.name, c.type, COUNT(DISTINCT cr.contact_id) AS sql_contacts
    FROM raw.sf_campaign c
    LEFT JOIN credited cr ON cr.campaign_id = c.id
    WHERE NOT c.is_deleted
    GROUP BY c.id, c.name, c.type
    HAVING COUNT(DISTINCT cr.contact_id) > 0
    ORDER BY sql_contacts DESC
    LIMIT 10
  `;
  console.log(`\nTop ${rows.length} campaigns by SQL contributions:`);
  for (const r of rows) {
    console.log(`  ${String(r.sql_contacts).padStart(5)} — ${r.name}  [${r.type ?? "—"}]`);
  }

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
