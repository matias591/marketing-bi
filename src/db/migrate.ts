/**
 * Migration runner.
 *
 * Run from a developer laptop (NOT serverless): `pnpm db:migrate`.
 * Uses DIRECT_DATABASE_URL (port 5432, session mode) — drizzle-kit's standard
 * migration runner needs prepared statements and proper transactions, neither
 * of which the Supavisor transaction-mode pooler supports.
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_DATABASE_URL (preferred) or DATABASE_URL must be set.");
  process.exit(1);
}

async function main() {
  const sql = postgres(url!, { max: 1, prepare: false });

  // Tracking table for which migration files have been applied.
  await sql`
    CREATE SCHEMA IF NOT EXISTS drizzle;
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL UNIQUE,
      created_at bigint NOT NULL
    );
  `.simple();

  const dir = join(process.cwd(), "drizzle", "migrations");
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const path = join(dir, file);
    const content = await readFile(path, "utf8");
    const hash = file.replace(/\.sql$/, "");

    const existing = await sql`
      SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = ${hash} LIMIT 1
    `;
    if (existing.length > 0) {
      console.log(`✓ ${file} (already applied)`);
      continue;
    }

    console.log(`→ applying ${file}…`);
    await sql.unsafe(content);
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${Date.now()})
    `;
    console.log(`✓ ${file}`);
  }

  await sql.end();
  console.log("\nAll migrations applied.");
}

main().catch((err) => {
  console.error("Migration failed:");
  console.error(err);
  process.exit(1);
});
