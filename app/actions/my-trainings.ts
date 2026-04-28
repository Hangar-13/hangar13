"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { UserTrainingEnrollmentRow } from "@/lib/my-trainings-display";
import { revalidatePath } from "next/cache";

export type { UserTrainingEnrollmentRow } from "@/lib/my-trainings-display";

export async function getMyTrainingsPageData(userId: string): Promise<{
  currentUserTrainingId: string | null;
  inProgress: UserTrainingEnrollmentRow[];
  completed: UserTrainingEnrollmentRow[];
}> {
  const supabase = await createServerSupabaseClient();

  const [{ data: userRow }, { data: rows, error }] = await Promise.all([
    supabase.from("users").select("current_curriculum_id").eq("id", userId).single(),
    supabase
      .from("user_trainings")
      .select(
        `
        id,
        status,
        start_date,
        end_date,
        training_path_id,
        training_paths:training_path_id ( id, name, description, is_active )
      `
      )
      .eq("user_id", userId)
      .order("start_date", { ascending: false }),
  ]);

  if (error) {
    console.error("getMyTrainingsPageData:", error);
    return {
      currentUserTrainingId: userRow?.current_curriculum_id ?? null,
      inProgress: [],
      completed: [],
    };
  }

  const list = (rows ?? []) as UserTrainingEnrollmentRow[];
  const inProgress = list.filter((r) => r.status !== "completed");
  const completed = list.filter((r) => r.status === "completed");

  return {
    currentUserTrainingId: userRow?.current_curriculum_id ?? null,
    inProgress,
    completed,
  };
}

/**
 * Sets the user's active enrollment (users.current_curriculum_id).
 */
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

  const { data: row, error: aErr } = await supabase
    .from("user_trainings")
    .select("id, status")
    .eq("id", userTrainingId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (aErr || !row) {
    return { error: "Enrollment not found." };
  }
  if (row.status === "completed") {
    return { error: "Completed training cannot be set as current." };
  }

  const { error } = await supabase
    .from("users")
    .update({ current_curriculum_id: userTrainingId })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/student/credentials");
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/training");
  revalidatePath("/dashboard/student/progress");
  revalidatePath("/dashboard/student/logbook");
  revalidatePath("/dashboard/student/certification");
  return {};
}
