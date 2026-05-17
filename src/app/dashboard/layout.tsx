import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { profiles } from "@/db/schema/public";
import { Sidebar } from "@/components/dashboard/sidebar";
import { UserMenu } from "@/components/dashboard/user-menu";
import { FreshnessPill } from "@/components/dashboard/freshness-pill";
import { Providers } from "@/app/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getLatestSyncAt(): Promise<Date | null> {
  // Latest successful or partial sync's `finished_at` is the freshness signal
  // (PLAT-05 — read from data, not the cron schedule).
  const rows = await db.execute<{ finished_at: Date | null }>(sql`
    SELECT finished_at FROM ops.sync_runs
    WHERE status IN ('success', 'partial') AND finished_at IS NOT NULL
    ORDER BY finished_at DESC
    LIMIT 1
  `);
  const first = rows[0] as { finished_at: Date | string | null } | undefined;
  if (!first?.finished_at) return null;
  return typeof first.finished_at === "string"
    ? new Date(first.finished_at)
    : first.finished_at;
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const profileRows = await db
    .select({ email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(sql`${profiles.id} = ${user.id}`)
    .limit(1);

  const profile = profileRows[0] ?? { email: user.email ?? "", role: "end_user" };
  const latestSyncAt = await getLatestSyncAt();

  return (
    <div className="flex min-h-svh">
      <Sidebar isAdmin={profile.role === "admin"} />
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-11 items-center justify-between border-b border-(--color-border) bg-(--color-surface)/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-(--color-surface)/70">
          <div className="flex items-center gap-3">
            <FreshnessPill syncedAt={latestSyncAt} />
          </div>
          <UserMenu email={profile.email} role={profile.role} />
        </header>
        <main className="flex-1 overflow-auto bg-(--color-bg) px-4 py-4">
          <Providers>{children}</Providers>
        </main>
      </div>
    </div>
  );
}
