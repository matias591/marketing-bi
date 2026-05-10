/**
 * Supabase Server Client — for Server Components, Server Actions, Route Handlers.
 *
 * Uses @supabase/ssr (the supported package for App Router).
 * The session lives in HTTP-only cookies; this client reads / writes them via
 * Next.js's `cookies()` API.
 *
 * Per CLAUDE.md and PLAT-12, every consumer must `export const runtime = 'nodejs'`.
 */
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot mutate cookies. The middleware refreshes
            // the session on every request, so it's safe to ignore here.
          }
        },
      },
    },
  );
}
