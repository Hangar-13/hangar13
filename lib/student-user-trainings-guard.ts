import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";

const FIND_TRAINING = "/dashboard/student/find-training";

export async function countUserTrainingsForUser(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  const { count, error } = await supabase
    .from("user_trainings")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error("countUserTrainingsForUser:", error);
    return 0;
  }
  return count ?? 0;
}

/** Redirects to Find Training when the user has no enrollments (browse-only state). */
export async function redirectIfNoUserTrainings(userId: string) {
  const n = await countUserTrainingsForUser(userId);
  if (n === 0) {
    redirect(FIND_TRAINING);
  }
}
