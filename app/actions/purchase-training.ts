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
import { pinLatestCourseVersionsForPathEnrollment } from "@/lib/course-versions";

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

  await pinLatestCourseVersionsForPathEnrollment({
    supabase,
    trainingPathId,
    userId: user.id,
    pinnedByUserId: user.id,
    enrollmentSource: "self_service",
    pathOrganizationId: path.organization_id as string,
  });

  // Enroll the learner into every Talent LMS course mapped to this path. The
  // first call JIT-creates their Talent account (idempotent), so a brand-new
  // user who has never used SSO still gets a Talent profile + enrollments here.
  //
  // Path items can be whole courses, modules, or individual lessons, so resolve the
  // owning Hangar course for each granularity (lesson → module → course) before
  // mapping to Talent course ids — otherwise module/lesson-built paths enroll nothing.
  const { data: pathItemRows } = await supabase
    .from("training_path_items")
    .select("course_id, module_id, lesson_id")
    .eq("training_path_id", trainingPathId);

  const hangarCourseIdSet = new Set<string>();
  const moduleIdSet = new Set<string>();
  const lessonIdSet = new Set<string>();
  for (const item of pathItemRows ?? []) {
    if (typeof item.course_id === "string" && item.course_id) {
      hangarCourseIdSet.add(item.course_id);
    } else if (typeof item.module_id === "string" && item.module_id) {
      moduleIdSet.add(item.module_id);
    } else if (typeof item.lesson_id === "string" && item.lesson_id) {
      lessonIdSet.add(item.lesson_id);
    }
  }

  if (lessonIdSet.size > 0) {
    const { data: lessonRows } = await supabase
      .from("lessons")
      .select("module_id")
      .in("id", [...lessonIdSet]);
    for (const row of lessonRows ?? []) {
      if (typeof row.module_id === "string" && row.module_id) {
        moduleIdSet.add(row.module_id);
      }
    }
  }

  if (moduleIdSet.size > 0) {
    const { data: moduleRows } = await supabase
      .from("modules")
      .select("course_id")
      .in("id", [...moduleIdSet]);
    for (const row of moduleRows ?? []) {
      if (typeof row.course_id === "string" && row.course_id) {
        hangarCourseIdSet.add(row.course_id);
      }
    }
  }

  const distinctHangarCourseIds = [...hangarCourseIdSet];

  if (distinctHangarCourseIds.length > 0) {
    const apiConfig = getTalentLmsApiEnrollmentConfig();
    if (apiConfig) {
      const { data: talentCourseRows } = await supabase
        .from("courses")
        .select("talent_lms_course_id")
        .in("id", distinctHangarCourseIds);

      const talentCourseIds = [
        ...new Set(
          (talentCourseRows ?? [])
            .map((c) => c.talent_lms_course_id as string | null | undefined)
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter((v) => v.length > 0)
        ),
      ];

      if (talentCourseIds.length > 0) {
        const { data: profile } = await supabase
          .from("users")
          .select("email, full_name")
          .eq("id", user.id)
          .maybeSingle();
        const enrollEmail =
          `${profile?.email || user.email || ""}`.trim().toLowerCase();
        if (enrollEmail) {
          for (const courseId of talentCourseIds) {
            const tl = await ensureTalentLmsUserAndEnrollInCourse({
              config: apiConfig,
              userEmail: enrollEmail,
              fullName: profile?.full_name,
              courseId,
            });
            if (!tl.ok) {
              console.error(
                "[TalentLMS] enroll user in course on path enrollment failed:",
                courseId,
                tl.status,
                tl.message
              );
            }
          }
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
