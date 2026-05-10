import { defineConfig } from "drizzle-kit";

const url = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DIRECT_DATABASE_URL (preferred) or DATABASE_URL must be set");

export default defineConfig({
  schema: "./src/db/schema/*.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  schemaFilter: ["public", "raw", "ops"],
  verbose: true,
  strict: true,
});
