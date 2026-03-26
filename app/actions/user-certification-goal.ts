"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Certification } from "@/lib/certification";
import { revalidatePath } from "next/cache";

const ALLOWED: Certification[] = ["FAA_A", "FAA_P", "FAA_AP"];

export async function setCurrentCertificationGoal(
  certification: Certification | null
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  if (certification !== null && !ALLOWED.includes(certification)) {
    return { error: "Invalid certification selection." };
  }

  const { error } = await supabase
    .from("users")
    .update({ current_certification: certification })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/apprentice");
  revalidatePath("/dashboard/apprentice/certification");
  revalidatePath("/dashboard/apprentice/progress");
  return {};
}
