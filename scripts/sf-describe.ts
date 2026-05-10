/**
 * One-shot SF probe.
 *
 *   pnpm tsx --env-file=.env.local scripts/sf-describe.ts
 *
 * 1. Authorize via JWT Bearer Flow (catches Connected App misconfig fast).
 * 2. List the custom fields on Contact + Presentation__c so we can confirm
 *    the API names hardcoded in src/lib/sf/objects.ts match.
 * 3. Print row counts of the 7 SF objects we sync.
 */
import { getJsforceConnection } from "../src/lib/sf/jwt";

interface Field {
  name: string;
  label: string;
  type: string;
  custom: boolean;
}

async function main() {
  console.log("Authorizing via JWT Bearer Flow…");
  const conn = await getJsforceConnection();
  console.log(`✓ Authorized. Instance: ${(conn as unknown as { instanceUrl: string }).instanceUrl}\n`);

  for (const sobj of ["Contact", "Presentation__c"] as const) {
    try {
      const meta = await conn.sobject(sobj).describe();
      const fields = meta.fields as unknown as Field[];
      const customFields = fields.filter((f) => f.custom);
      console.log(`=== ${sobj} — ${customFields.length} custom fields ===`);
      for (const f of customFields) {
        console.log(`  ${f.name.padEnd(40)} ${f.type.padEnd(12)} ${f.label}`);
      }
      console.log();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`⚠ Could not describe ${sobj}: ${msg}\n`);
    }
  }

  console.log("=== Row counts (queryAll — includes soft-deleted) ===");
  const objects = [
    "Contact",
    "Account",
    "Campaign",
    "CampaignMember",
    "Opportunity",
    "OpportunityContactRole",
    "Presentation__c",
  ];
  for (const obj of objects) {
    try {
      const result = await conn.query<{ total: number }>(`SELECT COUNT() FROM ${obj}`, {
        scanAll: true,
      });
      console.log(`  ${obj.padEnd(28)} ${result.totalSize.toLocaleString()}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ${obj.padEnd(28)} ⚠ ${msg}`);
    }
  }
}

main().catch((e) => {
  console.error("\nFAILED:");
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
