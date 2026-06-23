"use server";

import { revalidatePath } from "next/cache";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { provisionTalentLmsAccountForCurrentUser } from "@/lib/talentlms/provision-account";

export type RetryTalentProvisioningResult =
  | { ok: true }
  | { ok: false; attempts: number; message: string };

/**
 * Re-attempts TalentLMS account provisioning for the signed-in learner.
 * Backs the "Try again" button on the dashboard banner.
 */
export async function retryTalentLmsProvisioning(): Promise<RetryTalentProvisioningResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    return { ok: false, attempts: 0, message: "Not authenticated." };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const outcome = await provisionTalentLmsAccountForCurrentUser({
    supabase,
    email: profile?.email || user.email,
    fullName: profile?.full_name,
  });

  if (outcome.state === "provisioned" || outcome.state === "skipped") {
    revalidatePath("/dashboard/student");
    return { ok: true };
  }

  return { ok: false, attempts: outcome.attempts, message: outcome.message };
}
