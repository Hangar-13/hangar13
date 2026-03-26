"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { UserTrainingRowWithPlan } from "@/lib/my-trainings-display";
import { revalidatePath } from "next/cache";

export type { UserTrainingRowWithPlan } from "@/lib/my-trainings-display";

export async function getMyTrainingsPageData(userId: string): Promise<{
  currentUserTrainingId: string | null;
  inProgress: UserTrainingRowWithPlan[];
  completed: UserTrainingRowWithPlan[];
}> {
  const supabase = await createServerSupabaseClient();

  const [{ data: userRow }, { data: rows, error }] = await Promise.all([
    supabase
      .from("users")
      .select("current_user_training_id")
      .eq("id", userId)
      .single(),
    supabase
      .from("user_trainings")
      .select(
        `
        id,
        status,
        start_date,
        end_date,
        notes,
        training_plans:training_plan_id ( name, description )
      `
      )
      .eq("user_id", userId)
      .order("start_date", { ascending: false }),
  ]);

  if (error) {
    console.error("getMyTrainingsPageData:", error);
    return {
      currentUserTrainingId: userRow?.current_user_training_id ?? null,
      inProgress: [],
      completed: [],
    };
  }

  const list = (rows ?? []) as UserTrainingRowWithPlan[];
  const inProgress = list.filter((r) => r.status !== "completed");
  const completed = list.filter((r) => r.status === "completed");

  return {
    currentUserTrainingId: userRow?.current_user_training_id ?? null,
    inProgress,
    completed,
  };
}

export async function setCurrentUserTraining(
  userTrainingId: string
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { data: ut, error: utErr } = await supabase
    .from("user_trainings")
    .select("id, user_id, status")
    .eq("id", userTrainingId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (utErr || !ut) {
    return { error: "Training not found." };
  }
  if (ut.status === "completed") {
    return { error: "Completed training cannot be set as current." };
  }

  const { error } = await supabase
    .from("users")
    .update({ current_user_training_id: userTrainingId })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/apprentice/credentials");
  revalidatePath("/dashboard/apprentice");
  revalidatePath("/dashboard/apprentice/training");
  revalidatePath("/dashboard/apprentice/progress");
  revalidatePath("/dashboard/apprentice/logbook");
  revalidatePath("/dashboard/apprentice/certification");
  return {};
}
