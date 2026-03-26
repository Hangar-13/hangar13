"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export async function purchaseTrainingPlan(
  trainingPlanId: string
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { error: "Not authenticated." };
  }

  const { data: plan, error: planErr } = await supabase
    .from("training_plans")
    .select("id")
    .eq("id", trainingPlanId)
    .eq("is_active", true)
    .maybeSingle();

  if (planErr || !plan) {
    return { error: "Training program not found." };
  }

  const { data: existing } = await supabase
    .from("user_trainings")
    .select("id")
    .eq("user_id", user.id)
    .eq("training_plan_id", trainingPlanId)
    .maybeSingle();

  if (existing) {
    return { error: "You are already enrolled in this program." };
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: inserted, error: insertErr } = await supabase
    .from("user_trainings")
    .insert({
      user_id: user.id,
      training_plan_id: trainingPlanId,
      start_date: today,
      status: "active",
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    return { error: insertErr?.message ?? "Could not complete enrollment." };
  }

  const { error: userErr } = await supabase
    .from("users")
    .update({ current_user_training_id: inserted.id })
    .eq("id", user.id);

  if (userErr) {
    return { error: userErr.message };
  }

  revalidatePath("/dashboard/apprentice/find-training");
  revalidatePath("/dashboard/apprentice");
  revalidatePath("/dashboard/apprentice/training");
  revalidatePath("/dashboard/apprentice/progress");
  revalidatePath("/dashboard/apprentice/credentials");
  revalidatePath("/dashboard/apprentice/logbook");
  revalidatePath("/dashboard/apprentice/certification");
  return {};
}
