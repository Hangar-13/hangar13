import type { SupabaseClient } from "@supabase/supabase-js";
import type { Certification } from "@/lib/certification";

/** Row from public.user_trainings (enrollment in a training program). */
export type UserTrainingRow = {
  id: string;
  user_id: string;
  mentor_id: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  notes: string | null;
  training_plan_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Active enrollment + optional certification goal (both live on public.users). */
export type CurrentUserTrainingContext = {
  userTraining: UserTrainingRow | null;
  currentCertification: Certification | null;
};

/**
 * Resolves the trainee's active training from users.current_user_training_id.
 * Dashboard, logbook, and progress should use this instead of picking any row by user_id.
 */
export async function getCurrentUserTrainingContext(
  supabase: SupabaseClient,
  userId: string
): Promise<CurrentUserTrainingContext> {
  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("current_user_training_id, current_certification")
    .eq("id", userId)
    .single();

  if (userErr || !userRow) {
    return { userTraining: null, currentCertification: null };
  }

  const cert = (userRow.current_certification as Certification | null) ?? null;

  if (!userRow.current_user_training_id) {
    return { userTraining: null, currentCertification: cert };
  }

  const { data: ut, error: utErr } = await supabase
    .from("user_trainings")
    .select("*")
    .eq("id", userRow.current_user_training_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (utErr || !ut) {
    return { userTraining: null, currentCertification: cert };
  }

  return {
    userTraining: ut as UserTrainingRow,
    currentCertification: cert,
  };
}
