"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";

/**
 * Trigger an SF sync run from the /admin/sync page.
 *
 * Server-side so the CRON_SECRET stays on the server. Calls the cron route
 * with the secret as Authorization. The route does the JWT auth, the SF
 * pulls, the upserts, and the mart refresh — exactly the same flow as the
 * weekly Vercel Cron would.
 */
export async function triggerSyncAction(): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, message: "CRON_SECRET is not configured on this deployment." };
  }

  try {
    const res = await fetch(`${baseUrl}/api/cron/sync`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      // The cron handler can run up to 300s; this server action's timeout is
      // governed by the page route's maxDuration (60s). For longer runs we
      // fire-and-forget — the cron handler keeps running on Vercel and the
      // /admin/sync page can be refreshed to see progress in ops.sync_runs.
      signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, message: `Cron returned ${res.status}: ${body.slice(0, 200)}` };
    }
    revalidatePath("/dashboard/admin/sync");
    return { ok: true, message: "Sync triggered. Refresh in a few seconds to see progress." };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // The cron is fire-and-forget on long runs — a timeout here doesn't mean
    // the cron didn't run, just that we stopped waiting on it.
    if (msg.includes("aborted") || msg.includes("timeout")) {
      revalidatePath("/dashboard/admin/sync");
      return {
        ok: true,
        message: "Sync started (still running). Refresh in ~1-2 minutes to see results.",
      };
    }
    return { ok: false, message: msg };
  }
}
