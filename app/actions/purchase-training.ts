"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  listUserOrganizationIds,
  userMaySelfEnrollFromVisibility,
} from "@/lib/discoverable-training-paths";
import { revalidatePath } from "next/cache";
import {
  ensureTalentLmsUserAndEnrollInCourse,
  getTalentLmsApiEnrollmentConfig,
} from "@/lib/talentlms/api-enroll";

export async function purchaseTrainingPlan(
  trainingPathId: string
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { error: "Not authenticated." };
  }

  const [{ data: path, error: pathErr }, { data: me }, orgIds] =
    await Promise.all([
      supabase
        .from("training_paths")
        .select(
          "id, organization_id, is_active, visibility, monetization"
        )
        .eq("id", trainingPathId)
        .maybeSingle(),
      supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
      listUserOrganizationIds(supabase, user.id),
    ]);

  if (pathErr || !path) {
    return { error: "Training program not found." };
  }

  if (!path.is_active) {
    return { error: "Training program not found or inactive." };
  }

  const role = me?.role as string | undefined;
  const isPlatformAdmin = role === "admin" || role === "god";

  if (
    !userMaySelfEnrollFromVisibility({
      visibility: path.visibility as string,
      pathOrganizationId: path.organization_id as string,
      userOrganizationIds: orgIds,
      isPlatformAdmin,
    })
  ) {
    return { error: "This program is not available for self-enrollment." };
  }

  const { data: existing } = await supabase
    .from("user_trainings")
    .select("id")
    .eq("user_id", user.id)
    .eq("training_path_id", trainingPathId)
    .maybeSingle();

  if (existing) {
    return { error: "You are already enrolled in this program." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const monetization = (path.monetization as string) ?? "free";

  const { data: grant, error: grantErr } = await supabase
    .from("user_training_access_grants")
    .insert({
      user_id: user.id,
      training_path_id: trainingPathId,
      grant_kind: monetization,
      valid_from: new Date().toISOString(),
      valid_until: null,
    })
    .select("id")
    .single();

  if (grantErr || !grant) {
    return {
      error: grantErr?.message ?? "Could not complete enrollment checkout.",
    };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("user_trainings")
    .insert({
      user_id: user.id,
      training_path_id: trainingPathId,
      start_date: today,
      status: "active",
      enrollment_source: "self_service",
      user_access_grant_id: grant.id as string,
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

  let tlCourse: string | null = null;
  const { data: pathCourseRows } = await supabase
    .from("training_path_items")
    .select("course_id")
    .eq("training_path_id", trainingPathId)
    .not("course_id", "is", null);

  const distinctHangarCourseIds = [
    ...new Set(
      (pathCourseRows ?? [])
        .map((r) => r.course_id as string | null | undefined)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const enrollHangarCourseId =
    distinctHangarCourseIds.length === 1 ? distinctHangarCourseIds[0]! : null;

  if (enrollHangarCourseId) {
    const { data: hangarCourse } = await supabase
      .from("courses")
      .select("talent_lms_course_id")
      .eq("id", enrollHangarCourseId)
      .maybeSingle();
    const raw = hangarCourse?.talent_lms_course_id as string | null | undefined;
    tlCourse = raw?.trim() ? raw.trim() : null;
  }

  if (tlCourse) {
    const apiConfig = getTalentLmsApiEnrollmentConfig();
    if (apiConfig) {
      const { data: profile } = await supabase
        .from("users")
        .select("email, full_name")
        .eq("id", user.id)
        .maybeSingle();
      const enrollEmail =
        `${profile?.email || user.email || ""}`.trim().toLowerCase();
      if (enrollEmail) {
        const tl = await ensureTalentLmsUserAndEnrollInCourse({
          config: apiConfig,
          userEmail: enrollEmail,
          fullName: profile?.full_name,
          courseId: tlCourse,
        });
        if (!tl.ok) {
          console.error(
            "[TalentLMS] enroll user on Hangar signup failed:",
            tl.status,
            tl.message
          );
        }
      }
    }
  }

  revalidatePath("/dashboard/student/find-training");
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/training");
  revalidatePath("/dashboard/student/progress");
  revalidatePath("/dashboard/student/credentials");
  revalidatePath("/dashboard/student/logbook");
  revalidatePath("/dashboard/student/certification");
  return {};
}
