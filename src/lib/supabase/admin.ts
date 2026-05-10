/**
 * Service-role Supabase client.
 *
 * Server-only — never imported into a client component or middleware.
 * Used by:
 *   - the cron sync handler (writes to raw.* / ops.*)
 *   - admin operations like `inviteUserByEmail` (P6 admin UI)
 */
import { createClient } from "@supabase/supabase-js";

let _client: ReturnType<typeof createClient> | null = null;

export function adminClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for admin client.",
    );
  }

  _client = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return _client;
}
