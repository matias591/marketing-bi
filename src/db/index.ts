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
//  - prepare: false  → transaction mode does not support prepared statements
//  - max: 3          → small enough to stay within Supavisor's per-tenant pool
//                       on free tier, large enough that Promise.all of dashboard
//                       queries doesn't serialize over a single connection
//  - idle_timeout: 20→ release fast on Vercel's short-lived functions
const queryClient = postgres(connectionString, {
  prepare: false,
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, {
  schema: { ...raw, ...ops, ...publicSchema },
  casing: "snake_case",
});

export type DbClient = typeof db;
