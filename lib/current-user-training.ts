import type { SupabaseClient } from "@supabase/supabase-js";
import type { Certification } from "@/lib/certification";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";

/** Row from public.user_trainings (enrollment in a training program). */
export type UserTrainingRow = {
  id: string;
  user_id: string;
  mentor_id: string | null;
  start_date: string;
  end_date: string | null;
  status: string;
  notes: string | null;
  training_path_id: string;
  /** Sum of planned lesson hours for submitted lessons; maintained by DB trigger. */
  hours_completed: number;
  created_at: string;
  updated_at: string;
  enrollment_source?: string | null;
  user_access_grant_id?: string | null;
  seat_occupancy_id?: string | null;
};

/** Active enrollment + optional certification goal (both live on public.users). */
export type CurrentUserTrainingContext = {
  userTraining: UserTrainingRow | null;
  currentCertification: Certification | null;
};

/**
 * Resolves the trainee's active training from users.current_user_training_id.
 * Training-centric flows (weekly content, progress for one enrollment) should use this.
 */
export async function getCurrentUserTrainingContext(
  supabase: SupabaseClient,
  userId: string
): Promise<CurrentUserTrainingContext> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userRow: {
    current_user_training_id: string | null;
    current_certification: string | null;
  } | null = null;

  if (user?.id === userId) {
    const p = await fetchSessionUserProfile(supabase);
    if (p) {
      userRow = {
        current_user_training_id: p.current_user_training_id,
        current_certification: p.current_certification,
      };
    }
  } else {
    const { data, error } = await supabase
      .from("users")
      .select("current_user_training_id, current_certification")
      .eq("id", userId)
      .maybeSingle();
    if (!error && data) {
      userRow = {
        current_user_training_id: data.current_user_training_id as string | null,
        current_certification: data.current_certification as string | null,
      };
    }
  }

  if (!userRow) {
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

