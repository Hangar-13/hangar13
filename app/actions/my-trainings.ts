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

  const { error } = await supabase.rpc("set_current_curriculum_id", {
    p_user_training_id: userTrainingId,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("Not authenticated")) {
      return { error: "Not authenticated." };
    }
    if (msg.includes("Enrollment not found")) {
      return { error: "Enrollment not found." };
    }
    if (msg.includes("Completed training cannot be set")) {
      return { error: "Completed training cannot be set as current." };
    }
    return { error: msg || "Could not update current training." };
  }

  revalidatePath("/dashboard/student", "layout");
  return {};
}
