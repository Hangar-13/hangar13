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
} from "@/lib/course-versions";

export type CourseVersionUpdateOfferView = {
  courseId: string;
  courseName: string;
  pinnedLabel: string;
  latestLabel: string;
  latestVersionId: string;
  releaseNotes: string | null;
  authority: "user" | "organization";
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
  };
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

  const offers = await findCourseVersionUpdatesForPath(
    supabase,
    ut.training_path_id,
    {
      userId: user.id,
      enrollmentSource: ut.enrollment_source as string | null,
      pathOrganizationId: (path?.organization_id as string | null) ?? null,
    }
  );

  return {
    ok: true,
    updates: offers
      .filter((o) => o.authority === "user")
      .map(toView),
  };
}

export async function acceptCourseVersionUpdate(input: {
  courseId: string;
  courseVersionId: string;
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
