/**
 * Sanity-check SOQL: for each object in SF_OBJECTS, run the SELECT field list
 * with `LIMIT 1`. Catches any field-name typos or missing fields before we
 * fire the full sync.
 *
 *   pnpm exec tsx --env-file=.env.local scripts/sf-soql-check.ts
 */
import { getJsforceConnection } from "../src/lib/sf/jwt";
import { SF_OBJECTS } from "../src/lib/sf/objects";

async function main() {
  const conn = await getJsforceConnection();

  let allOk = true;
  for (const def of SF_OBJECTS) {
    const soql = `SELECT ${def.fields.join(", ")} FROM ${def.name} LIMIT 1`;
    try {
      const result = await conn.query<Record<string, unknown>>(soql, {
        scanAll: def.useQueryAll,
      });
      const got = result.records?.[0];
      if (got) {
        const mapped = def.mapRow(got);
        console.log(`✓ ${def.name.padEnd(28)} ${Object.keys(mapped).length} columns mapped`);
      } else {
        console.log(`✓ ${def.name.padEnd(28)} (no rows in org)`);
      }
    } catch (err: unknown) {
      allOk = false;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ ${def.name.padEnd(28)} ${msg}`);
    }
  }
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
