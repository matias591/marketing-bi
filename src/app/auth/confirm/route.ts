/**
 * Invite / OTP confirmation route.
 *
 * The Supabase invite email contains a link of shape
 *   /auth/confirm?token_hash=...&type=invite&next=/auth/set-password
 * When the user clicks it, we exchange the token for a session via
 * `verifyOtp`, set the session cookies, and redirect to the next destination.
 *
 * Reference: @supabase/ssr docs §"Confirm route".
 */
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard/campaigns";

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/login?error=invalid_link", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }

  // For invite/recovery, the user lands on /auth/set-password to set their
  // first password. For magiclink/email-change, they go straight through.
  const redirectTarget =
    type === "invite" || type === "recovery" ? "/auth/set-password" : next;
  const url = new URL(redirectTarget, request.url);
  if (next && (type === "invite" || type === "recovery")) {
    url.searchParams.set("next", next);
  }
  return NextResponse.redirect(url);
}
