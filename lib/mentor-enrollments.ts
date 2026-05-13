import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserTrainingRow } from "@/lib/current-user-training";

/** Prefer profile mentor (`users.mentor_id`) so sign-off/notifications stay aligned with enrollments. */
export function effectiveMentorIdFromEnrollmentRow(
  row: {
    mentor_id: string | null;
    users?: { mentor_id: string | null } | { mentor_id: string | null }[] | null;
  }
): string | null {
  const u = row.users;
  const profile = Array.isArray(u) ? u[0] : u;
  const fromProfile = profile?.mentor_id ?? null;
  return fromProfile ?? row.mentor_id ?? null;
}

/** Active enrollments where this user is the assigned mentor (profile or per-row). */
export async function fetchActiveEnrollmentIdsForMentor(
  supabase: SupabaseClient,
  mentorUserId: string
): Promise<string[]> {
  const { data: byUt } = await supabase
    .from("user_trainings")
    .select("id")
    .eq("mentor_id", mentorUserId)
    .eq("status", "active");

  const { data: trainees } = await supabase
    .from("users")
    .select("id")
    .eq("mentor_id", mentorUserId);

  const traineeUserIds = (trainees ?? []).map((t) => t.id);
  let byProfile: { id: string }[] | null = null;
  if (traineeUserIds.length > 0) {
    const { data } = await supabase
      .from("user_trainings")
      .select("id")
      .in("user_id", traineeUserIds)
      .eq("status", "active");
    byProfile = data;
  }

  const ids = new Set<string>();
  for (const r of byUt ?? []) ids.add(r.id);
  for (const r of byProfile ?? []) ids.add(r.id);
  return [...ids];
}

export async function mentorHasAccessToEnrollment(
  supabase: SupabaseClient,
  mentorUserId: string,
  enrollmentId: string
): Promise<boolean> {
  const { data: row } = await supabase
    .from("user_trainings")
    .select("mentor_id, user_id")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!row) return false;
  if (row.mentor_id === mentorUserId) return true;
  return mentorHasAccessToTrainee(supabase, mentorUserId, row.user_id);
}

/** Trainee user ids this mentor may see logbook for (profile assignment and/or enrollment assignment). */
export async function fetchTraineeUserIdsForMentor(
  supabase: SupabaseClient,
  mentorUserId: string
): Promise<string[]> {
  const ids = new Set<string>();

  const { data: byProfile } = await supabase.from("users").select("id").eq("mentor_id", mentorUserId);
  for (const r of byProfile ?? []) ids.add(r.id);

  const { data: byUt } = await supabase
    .from("user_trainings")
    .select("user_id")
    .eq("mentor_id", mentorUserId)
    .eq("status", "active");
  for (const r of byUt ?? []) ids.add(r.user_id);

  return [...ids];
}

export async function traineeUserIdsFromEnrollmentIds(
  supabase: SupabaseClient,
  enrollmentIds: string[]
): Promise<string[]> {
  if (enrollmentIds.length === 0) return [];
  const { data } = await supabase
    .from("user_trainings")
    .select("user_id")
    .in("id", enrollmentIds);
  return [...new Set((data ?? []).map((r) => r.user_id))];
}

export async function mentorHasAccessToTrainee(
  supabase: SupabaseClient,
  mentorUserId: string,
  traineeUserId: string
): Promise<boolean> {
  const { data: row } = await supabase
    .from("users")
    .select("mentor_id")
    .eq("id", traineeUserId)
    .maybeSingle();
  if (row?.mentor_id === mentorUserId) return true;

  const { data: ut } = await supabase
    .from("user_trainings")
    .select("id")
    .eq("user_id", traineeUserId)
    .eq("mentor_id", mentorUserId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return !!ut;
}

/** Prefer the trainee's active pointer; otherwise newest enrollment (stable dashboard cards). */
export function pickOneEnrollmentPerTrainee(
  rows: UserTrainingRow[],
  currentCurriculumIdByUserId: Map<string, string | null>
): UserTrainingRow[] {
  const byUser = new Map<string, UserTrainingRow[]>();
  for (const r of rows) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r);
    byUser.set(r.user_id, list);
  }
  const out: UserTrainingRow[] = [];
  for (const [traineeUserId, list] of byUser) {
    const preferredId = currentCurriculumIdByUserId.get(traineeUserId) ?? null;
    const preferred =
      preferredId != null ? list.find((r) => r.id === preferredId) : undefined;
    if (preferred) {
      out.push(preferred);
      continue;
    }
    out.push(
      [...list].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0]!
    );
  }
  return out;
}

export async function fetchCurrentCurriculumIdsForUsers(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string | null>> {
  if (userIds.length === 0) return new Map();
  const { data } = await supabase
    .from("users")
    .select("id, current_user_training_id")
    .in("id", userIds);
  const m = new Map<string, string | null>();
  for (const r of data ?? []) {
    m.set(r.id as string, (r as { current_user_training_id: string | null }).current_user_training_id);
  }
  return m;
}
