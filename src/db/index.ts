import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as raw from "./schema/raw";
import * as ops from "./schema/ops";
import * as publicSchema from "./schema/public";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set (Supavisor transaction mode, port 6543).");
}

// CRITICAL — Supavisor transaction mode (port 6543) requirements (Pitfall 4):
//  - prepare: false   → transaction mode does not support prepared statements
//  - max: 3           → small enough to stay within Supavisor's per-tenant pool
//                       on free tier, large enough that Promise.all of dashboard
//                       queries doesn't serialize over a single connection
//  - idle_timeout: 5  → close idle conns fast. Vercel may freeze the function
//                       between requests; connections idle longer than this
//                       have likely been silently dropped by Supavisor and
//                       will hang on reuse.
//  - max_lifetime: 60 → forcibly recycle every connection after 60s. Backup
//                       safety net for the same stale-connection issue.
//  - connection.application_name → visible in pg_stat_activity for debugging
const queryClient = postgres(connectionString, {
  prepare: false,
  max: 3,
  idle_timeout: 5,
  max_lifetime: 60,
  connect_timeout: 10,
  connection: {
    application_name: "marketing-bi",
  },
});

export const db = drizzle(queryClient, {
  schema: { ...raw, ...ops, ...publicSchema },
  casing: "snake_case",
});

export type DbClient = typeof db;
