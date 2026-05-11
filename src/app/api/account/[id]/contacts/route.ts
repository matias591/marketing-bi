/**
 * Account → contacts list (for the slide-in drill-down panel).
 *
 *   GET /api/account/{id}/contacts → { account, contacts }
 *
 * Auth-gated like the dashboards. Returns the same data shape the
 * /dashboard/journey?accountId=X server component already used, but
 * delivered as JSON so a client-side Sheet can render it without a page
 * navigation.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAccount, getAccountContacts } from "@/app/dashboard/journey/query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing account id" }, { status: 400 });

  const [account, contacts] = await Promise.all([
    getAccount(id),
    getAccountContacts(id, 100),
  ]);
  if (!account) return NextResponse.json({ error: "account not found" }, { status: 404 });

  return NextResponse.json({ account, contacts });
}
