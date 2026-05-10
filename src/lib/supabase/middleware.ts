/**
 * Middleware-side Supabase client.
 *
 * Next.js middleware runs on the Edge runtime; we only use the @supabase/ssr
 * cookie helpers here (which are Edge-safe). All actual DB or jsforce code
 * runs in Route Handlers / Server Components with `runtime = 'nodejs'`.
 *
 * Responsibilities:
 *   1. Refresh the user's session on every request (via `getUser()`).
 *   2. Gate-redirect: if a signed-out user hits /dashboard/* or /admin/*,
 *      bounce to /login. (AUTH-04.)
 *   3. If a signed-in user hits /login, bounce to /dashboard/campaigns.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/methodology"];
const SIGNED_IN_BLOCKED_PREFIXES = ["/login"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // CRITICAL: do NOT replace this with `getSession()`. `getSession()` reads from
  // cookies without revalidation — `getUser()` re-validates the JWT against
  // Supabase Auth on every refresh, which is what `@supabase/ssr` requires.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (
    !user &&
    PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (
    user &&
    SIGNED_IN_BLOCKED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard/campaigns";
    dashUrl.search = "";
    return NextResponse.redirect(dashUrl);
  }

  return response;
}
