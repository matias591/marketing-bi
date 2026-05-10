import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load .env.local into process.env before tests run.
 * Node's --env-file flag can't be passed via NODE_OPTIONS for security
 * reasons, so we parse it ourselves here.
 */
const envPath = resolve(process.cwd(), ".env.local");
let raw: string;
try {
  raw = readFileSync(envPath, "utf8");
} catch {
  // No .env.local — okay if env is already set externally.
  raw = "";
}

for (const line of raw.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  if (process.env[key] === undefined) process.env[key] = value;
}
