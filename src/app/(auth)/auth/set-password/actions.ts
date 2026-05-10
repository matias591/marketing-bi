"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirm: z.string(),
    next: z.string().optional(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords don't match.",
    path: ["confirm"],
  });

export type SetPasswordState = { error?: string };

export async function setPasswordAction(
  _: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = Schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const supabase = await createClient();
  const { data: userRes, error: userError } = await supabase.auth.getUser();
  if (userError || !userRes?.user) {
    return { error: "Your invite link expired. Ask your admin to re-send." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { error: error.message };
  }

  const next = parsed.data.next?.startsWith("/") ? parsed.data.next : "/dashboard/campaigns";
  redirect(next);
}
