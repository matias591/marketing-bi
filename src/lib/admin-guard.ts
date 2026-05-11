/**
 * Server-side admin guard. Returns the active user's profile if they're an
 * admin; redirects to /dashboard/campaigns otherwise. Use at the top of every
 * /admin/* server component.
 */
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { profiles } from "@/db/schema/public";

export interface AdminProfile {
  id: string;
  email: string;
  role: "admin" | "end_user";
}

export async function requireAdmin(): Promise<AdminProfile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const rows = await db
    .select({ id: profiles.id, email: profiles.email, role: profiles.role })
    .from(profiles)
    .where(eq(profiles.id, user.id))
    .limit(1);

  const profile = rows[0];
  if (!profile || profile.role !== "admin") {
    redirect("/dashboard/campaigns");
  }
  return profile as AdminProfile;
}
