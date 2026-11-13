"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getActiveOrgDashboardContext } from "@/lib/org-dashboard-context";
import { hasOrganizationRolePermission } from "@/lib/auth-shared";
import {
  findCourseVersionUpdatesForPath,
  formatCourseVersion,
  getLatestCourseVersion,
  type CourseVersionUpdateOffer,
  type ResolveCourseVersionContext,
} from "@/lib/course-versions";
import { loadTrainingLessonStates } from "@/lib/training-lesson-state";
import { fetchLessonsForTrainingPath } from "@/lib/training-lessons";

export type CourseUpdateLesson = {
  id: string;
  title: string;
};

export type CourseVersionUpdateMode = "all" | "unfinished" | "selected";

export type CourseVersionUpdateOfferView = {
  courseId: string;
  courseName: string;
  pinnedLabel: string;
  latestLabel: string;
  latestVersionId: string;
  releaseNotes: string | null;
  authority: "user" | "organization";
  /** Finished lessons the student can choose to leave on the current version. */
  completedLessons: CourseUpdateLesson[];
};

function toView(offer: CourseVersionUpdateOffer): CourseVersionUpdateOfferView {
  return {
    courseId: offer.courseId,
    courseName: offer.courseName,
    pinnedLabel: formatCourseVersion(
      offer.pinnedVersion.major_version,
      offer.pinnedVersion.minor_version
    ),
    latestLabel: formatCourseVersion(
      offer.latestVersion.major_version,
      offer.latestVersion.minor_version
    ),
    latestVersionId: offer.latestVersion.id,
    releaseNotes: offer.latestVersion.release_notes,
    authority: offer.authority,
    completedLessons: [],
  };
}

async function lessonsInCourse(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  trainingPathId: string,
  courseId: string,
  ctx: ResolveCourseVersionContext
) {
  const lessons = await fetchLessonsForTrainingPath(supabase, trainingPathId, ctx);
  const { data: modules } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId);
  const moduleIds = new Set((modules ?? []).map((row) => row.id as string));
  return lessons.filter(
    (lesson) => typeof lesson.module_id === "string" && moduleIds.has(lesson.module_id)
  );
}

export async function getCourseVersionUpdatesForCurrentEnrollment(): Promise<
  { ok: true; updates: CourseVersionUpdateOfferView[] } | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: me } = await supabase
    .from("users")
    .select("current_user_training_id")
    .eq("id", user.id)
    .maybeSingle();

  const utId = me?.current_user_training_id as string | null;
  if (!utId) return { ok: true, updates: [] };

  const { data: ut } = await supabase
    .from("user_trainings")
    .select("training_path_id, enrollment_source")
    .eq("id", utId)
    .maybeSingle();

  if (!ut?.training_path_id) return { ok: true, updates: [] };

  const { data: path } = await supabase
    .from("training_paths")
    .select("organization_id")
    .eq("id", ut.training_path_id)
    .maybeSingle();

  const versionContext: ResolveCourseVersionContext = {
    userId: user.id,
    enrollmentSource: ut.enrollment_source as string | null,
    pathOrganizationId: (path?.organization_id as string | null) ?? null,
  };

  const offers = await findCourseVersionUpdatesForPath(
    supabase,
    ut.training_path_id,
    versionContext
  );

  const updates: CourseVersionUpdateOfferView[] = [];
  for (const offer of offers.filter((item) => item.authority === "user")) {
    const view = toView(offer);
    const courseLessons = await lessonsInCourse(
      supabase,
      ut.training_path_id,
      offer.courseId,
      versionContext
    );
    const states = await loadTrainingLessonStates(
      supabase,
      user.id,
      utId,
      courseLessons.map((lesson) => ({
        id: String(lesson.id),
        title: typeof lesson.title === "string" ? lesson.title : "Lesson",
        number: Number(lesson.number ?? 0),
        contentPackageId:
          typeof lesson.content_package_id === "string" ? lesson.content_package_id : null,
        testPackageId:
          typeof lesson.test_package_id === "string" ? lesson.test_package_id : null,
      }))
    );
    view.completedLessons = states
      .filter((lesson) => lesson.completed)
      .map((lesson) => ({ id: lesson.id, title: lesson.title }));
    updates.push(view);
  }

  return { ok: true, updates };
}

export async function acceptCourseVersionUpdate(input: {
  courseId: string;
  courseVersionId: string;
  mode: CourseVersionUpdateMode;
  lessonIds?: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: version } = await supabase
    .from("course_versions")
    .select("id, course_id")
    .eq("id", input.courseVersionId)
    .maybeSingle();

  if (!version || version.course_id !== input.courseId) {
    return { ok: false, error: "Version not found." };
  }

  const latest = await getLatestCourseVersion(supabase, input.courseId);
  if (!latest || latest.id !== input.courseVersionId) {
    return { ok: false, error: "Only the latest published version can be adopted." };
  }

  const { data: me } = await supabase
    .from("users")
    .select("current_user_training_id")
    .eq("id", user.id)
    .maybeSingle();
  const utId = me?.current_user_training_id as string | null;
  if (!utId) return { ok: false, error: "No active training." };

  const { data: ut } = await supabase
    .from("user_trainings")
    .select("training_path_id, enrollment_source")
    .eq("id", utId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ut?.training_path_id) return { ok: false, error: "No active training." };

  const { data: path } = await supabase
    .from("training_paths")
    .select("organization_id")
    .eq("id", ut.training_path_id)
    .maybeSingle();

  const versionContext: ResolveCourseVersionContext = {
    userId: user.id,
    enrollmentSource: ut.enrollment_source as string | null,
    pathOrganizationId: (path?.organization_id as string | null) ?? null,
  };

  const offers = await findCourseVersionUpdatesForPath(
    supabase,
    ut.training_path_id,
    versionContext
  );
  const offer = offers.find(
    (item) =>
      item.courseId === input.courseId &&
      item.authority === "user" &&
      item.latestVersion.id === input.courseVersionId
  );
  if (!offer) return { ok: false, error: "No course update is available." };

  const courseLessons = await lessonsInCourse(
    supabase,
    ut.training_path_id,
    input.courseId,
    versionContext
  );
  const states = await loadTrainingLessonStates(
    supabase,
    user.id,
    utId,
    courseLessons.map((lesson) => ({
      id: String(lesson.id),
      title: typeof lesson.title === "string" ? lesson.title : "Lesson",
      number: Number(lesson.number ?? 0),
      contentPackageId:
        typeof lesson.content_package_id === "string" ? lesson.content_package_id : null,
      testPackageId:
        typeof lesson.test_package_id === "string" ? lesson.test_package_id : null,
    }))
  );
  const stateById = new Map(states.map((lesson) => [lesson.id, lesson]));
  const selected = new Set(input.lessonIds ?? []);
  const advanceIds: string[] = [];
  const keepRows: Array<{
    user_id: string;
    lesson_id: string;
    course_version_id: string;
    kept_by_user: boolean;
  }> = [];

  for (const lesson of courseLessons) {
    const lessonId = String(lesson.id);
    const state = stateById.get(lessonId);
    const completed = state?.completed ?? false;
    const optional = state?.optional ?? false;
    const currentVersionId =
      typeof lesson.course_version_id === "string"
        ? lesson.course_version_id
        : offer.pinnedVersion.id;
    const chosen =
      input.mode === "all" || (input.mode === "selected" && selected.has(lessonId));
    const advance = optional && !completed ? false : !completed || chosen;

    if (advance || currentVersionId === latest.id) {
      advanceIds.push(lessonId);
    } else {
      keepRows.push({
        user_id: user.id,
        lesson_id: lessonId,
        course_version_id: currentVersionId,
        kept_by_user: completed,
      });
    }
  }

  if (keepRows.length > 0) {
    const { error: holdError } = await supabase
      .from("lesson_version_holds")
      .upsert(keepRows, { onConflict: "user_id,lesson_id" });
    if (holdError) return { ok: false, error: holdError.message };
  }

  if (advanceIds.length > 0) {
    const { error: clearError } = await supabase
      .from("lesson_version_holds")
      .delete()
      .eq("user_id", user.id)
      .in("lesson_id", advanceIds);
    if (clearError) return { ok: false, error: clearError.message };
  }

  const { data: existing } = await supabase
    .from("course_version_pins")
    .select("id")
    .eq("course_id", input.courseId)
    .eq("user_id", user.id)
    .maybeSingle();

  const payload = {
    course_id: input.courseId,
    course_version_id: input.courseVersionId,
    user_id: user.id,
    organization_id: null,
    pinned_by: user.id,
    pinned_at: new Date().toISOString(),
  };

  const { error } = existing?.id
    ? await supabase.from("course_version_pins").update(payload).eq("id", existing.id)
    : await supabase.from("course_version_pins").insert(payload);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/student/training");
  revalidatePath("/dashboard/student/progress");
  revalidatePath("/dashboard/student");
  return { ok: true };
}

/** Drop a kept lesson so it follows the course version the student already adopted. */
export async function releaseLessonVersionHold(
  lessonId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: hold } = await supabase
    .from("lesson_version_holds")
    .select("id, kept_by_user")
    .eq("user_id", user.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (!hold?.kept_by_user) {
    return { ok: false, error: "This lesson is already on the current course version." };
  }

  const { error } = await supabase
    .from("lesson_version_holds")
    .delete()
    .eq("id", hold.id)
    .eq("user_id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/student/training");
  revalidatePath("/dashboard/student/progress");
  revalidatePath("/dashboard/student");
  return { ok: true };
}

export async function orgListCourseVersionPinsForPath(
  trainingPathId: string
): Promise<
  | {
      ok: true;
      rows: Array<{
        courseId: string;
        courseName: string;
        pinnedLabel: string | null;
        latestLabel: string;
        latestVersionId: string;
        courseVersionId: string | null;
        hasUpdate: boolean;
      }>;
    }
  | { ok: false; error: string }
> {
  const ctx = await getActiveOrgDashboardContext();
  if (
    !ctx ||
    !hasOrganizationRolePermission(ctx.organizationRole, "supervisor")
  ) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createServerSupabaseClient();

  const { data: items } = await supabase
    .from("training_path_items")
    .select("course_id, module_id, lesson_id")
    .eq("training_path_id", trainingPathId);

  const courseIds = new Set<string>();
  for (const item of items ?? []) {
    if (item.course_id) {
      courseIds.add(item.course_id as string);
      continue;
    }
    if (item.module_id) {
      const { data: mod } = await supabase
        .from("modules")
        .select("course_id")
        .eq("id", item.module_id)
        .maybeSingle();
      if (mod?.course_id) courseIds.add(mod.course_id as string);
      continue;
    }
    if (item.lesson_id) {
      const { data: les } = await supabase
        .from("lessons")
        .select("module_id")
        .eq("id", item.lesson_id)
        .maybeSingle();
      if (les?.module_id) {
        const { data: mod } = await supabase
          .from("modules")
          .select("course_id")
          .eq("id", les.module_id)
          .maybeSingle();
        if (mod?.course_id) courseIds.add(mod.course_id as string);
      }
    }
  }

  const ids = [...courseIds];
  if (ids.length === 0) return { ok: true, rows: [] };

  const { data: courses } = await supabase
    .from("courses")
    .select("id, name")
    .in("id", ids);

  const rows: Array<{
    courseId: string;
    courseName: string;
    pinnedLabel: string | null;
    latestLabel: string;
    latestVersionId: string;
    courseVersionId: string | null;
    hasUpdate: boolean;
  }> = [];

  for (const course of courses ?? []) {
    const courseId = course.id as string;
    const latest = await getLatestCourseVersion(supabase, courseId);
    if (!latest) continue;

    const { data: pin } = await supabase
      .from("course_version_pins")
      .select("course_version_id")
      .eq("organization_id", ctx.organizationId)
      .eq("course_id", courseId)
      .maybeSingle();

    let pinnedLabel: string | null = null;
    if (pin?.course_version_id) {
      const { data: pinned } = await supabase
        .from("course_versions")
        .select("major_version, minor_version")
        .eq("id", pin.course_version_id)
        .maybeSingle();
      if (pinned) {
        pinnedLabel = formatCourseVersion(
          pinned.major_version as number,
          pinned.minor_version as number
        );
      }
    }

    const latestLabel = formatCourseVersion(
      latest.major_version,
      latest.minor_version
    );

    rows.push({
      courseId,
      courseName: course.name as string,
      pinnedLabel,
      latestLabel,
      latestVersionId: latest.id,
      courseVersionId: (pin?.course_version_id as string | null) ?? null,
      hasUpdate:
        pinnedLabel != null &&
        formatCourseVersion(latest.major_version, latest.minor_version) !==
          pinnedLabel,
    });
  }

  return { ok: true, rows };
}

export async function orgPinCourseVersion(input: {
  courseId: string;
  courseVersionId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getActiveOrgDashboardContext();
  if (
    !ctx ||
    !hasOrganizationRolePermission(ctx.organizationRole, "supervisor")
  ) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: course } = await supabase
    .from("courses")
    .select("organization_id")
    .eq("id", input.courseId)
    .maybeSingle();

  if (!course || course.organization_id !== ctx.organizationId) {
    return { ok: false, error: "Course not in your organization." };
  }

  const { data: version } = await supabase
    .from("course_versions")
    .select("id, course_id")
    .eq("id", input.courseVersionId)
    .maybeSingle();

  if (!version || version.course_id !== input.courseId) {
    return { ok: false, error: "Version not found." };
  }

  const { data: existing } = await supabase
    .from("course_version_pins")
    .select("id")
    .eq("course_id", input.courseId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle();

  const payload = {
    course_id: input.courseId,
    course_version_id: input.courseVersionId,
    organization_id: ctx.organizationId,
    user_id: null,
    pinned_by: user.id,
    pinned_at: new Date().toISOString(),
  };

  const { error } = existing?.id
    ? await supabase.from("course_version_pins").update(payload).eq("id", existing.id)
    : await supabase.from("course_version_pins").insert(payload);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard/organization/subscriptions");
  revalidatePath("/dashboard/organization");
  return { ok: true };
}

export async function getLessonSubmissionCourseVersions(
  userTrainingId: string
): Promise<
  | {
      ok: true;
      rows: Array<{
        lessonId: string;
        lessonTitle: string;
        submittedAt: string;
        versionLabel: string | null;
      }>;
    }
  | { ok: false; error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated." };

  const { data: subs } = await supabase
    .from("lesson_submissions")
    .select("lesson_id, submitted_at, course_version_id")
    .eq("user_training_id", userTrainingId)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });

  if (!subs?.length) return { ok: true, rows: [] };

  const lessonIds = subs.map((s) => s.lesson_id as string);
  const versionIds = [
    ...new Set(
      subs
        .map((s) => s.course_version_id as string | null)
        .filter((id): id is string => typeof id === "string")
    ),
  ];

  const [{ data: lessons }, { data: versions }] = await Promise.all([
    supabase.from("lessons").select("id, title").in("id", lessonIds),
    versionIds.length
      ? supabase
          .from("course_versions")
          .select("id, major_version, minor_version")
          .in("id", versionIds)
      : Promise.resolve({ data: [] as { id: string; major_version: number; minor_version: number }[] }),
  ]);

  const titleByLesson = new Map(
    (lessons ?? []).map((l) => [l.id as string, l.title as string])
  );
  const versionById = new Map(
    (versions ?? []).map((v) => [
      v.id as string,
      formatCourseVersion(v.major_version as number, v.minor_version as number),
    ])
  );

  return {
    ok: true,
    rows: subs.map((s) => ({
      lessonId: s.lesson_id as string,
      lessonTitle: titleByLesson.get(s.lesson_id as string) ?? "Lesson",
      submittedAt: s.submitted_at as string,
      versionLabel: s.course_version_id
        ? versionById.get(s.course_version_id as string) ?? null
        : null,
    })),
  };
}
