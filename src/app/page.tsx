import { redirect } from "next/navigation";

/**
 * Root entry. Two cases:
 *   1. Supabase invite/recovery emails land here with `?token_hash=…&type=…`
 *      (when the email template uses `{{ .ConfirmationURL }}`). Forward the
 *      params to /auth/confirm so the PKCE token can be exchanged for a session.
 *   2. Normal visit — bounce to /dashboard/campaigns; middleware then bounces
 *      to /login if signed-out.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tokenHash = first(params.token_hash);
  const type = first(params.type);

  if (tokenHash && type) {
    const qs = new URLSearchParams({ token_hash: tokenHash, type });
    const next = first(params.next);
    if (next) qs.set("next", next);
    redirect(`/auth/confirm?${qs.toString()}`);
  }

  redirect("/dashboard/campaigns");
}

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
