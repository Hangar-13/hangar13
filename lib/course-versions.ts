import type { SupabaseClient } from "@supabase/supabase-js";

export type CourseVersionRow = {
  id: string;
  course_id: string;
  major_version: number;
  minor_version: number;
  release_notes: string | null;
  published_at: string;
  published_by: string | null;
};

export type CourseVersionPinScope = "user" | "organization";

export type CourseVersionUpdateOffer = {
  courseId: string;
  courseName: string;
  pinnedVersion: CourseVersionRow;
  latestVersion: CourseVersionRow;
  authority: CourseVersionPinScope;
};

/** Display label, e.g. "2.1". */
export function formatCourseVersion(major: number, minor: number): string {
  return `${major}.${minor}`;
}

export function compareCourseVersions(
  a: Pick<CourseVersionRow, "major_version" | "minor_version">,
  b: Pick<CourseVersionRow, "major_version" | "minor_version">
): number {
  if (a.major_version !== b.major_version) {
    return a.major_version - b.major_version;
  }
  return a.minor_version - b.minor_version;
}

export function isNewerCourseVersion(
  candidate: Pick<CourseVersionRow, "major_version" | "minor_version">,
  baseline: Pick<CourseVersionRow, "major_version" | "minor_version">
): boolean {
  return compareCourseVersions(candidate, baseline) > 0;
}

/** Who decides version adoption for this enrollment. */
export function courseVersionAuthorityForEnrollment(
  enrollmentSource: string | null | undefined
): CourseVersionPinScope {
  return enrollmentSource === "self_service" ? "user" : "organization";
}

/** All distinct course ids referenced by a training path's items. */
export async function listCourseIdsForTrainingPath(
  supabase: SupabaseClient,
  trainingPathId: string
): Promise<string[]> {
  const { data: items } = await supabase
    .from("training_path_items")
    .select("course_id, module_id, lesson_id")
    .eq("training_path_id", trainingPathId);

  if (!items?.length) return [];

  const courseIds = new Set<string>();

  for (const item of items) {
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

  return [...courseIds];
}

export async function getLatestCourseVersion(
  supabase: SupabaseClient,
  courseId: string
): Promise<CourseVersionRow | null> {
  const { data } = await supabase
    .from("course_versions")
    .select("id, course_id, major_version, minor_version, release_notes, published_at, published_by")
    .eq("course_id", courseId)
    .order("major_version", { ascending: false })
    .order("minor_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as CourseVersionRow | null) ?? null;
}

export async function listCourseVersions(
  supabase: SupabaseClient,
  courseId: string
): Promise<CourseVersionRow[]> {
  const { data } = await supabase
    .from("course_versions")
    .select("id, course_id, major_version, minor_version, release_notes, published_at, published_by")
    .eq("course_id", courseId)
    .order("major_version", { ascending: false })
    .order("minor_version", { ascending: false });

  return (data ?? []) as CourseVersionRow[];
}

async function getOrgPinForCourse(
  supabase: SupabaseClient,
  organizationId: string,
  courseId: string
): Promise<CourseVersionRow | null> {
  const { data: pin } = await supabase
    .from("course_version_pins")
    .select("course_version_id")
    .eq("organization_id", organizationId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!pin?.course_version_id) return null;

  const { data: version } = await supabase
    .from("course_versions")
    .select("id, course_id, major_version, minor_version, release_notes, published_at, published_by")
    .eq("id", pin.course_version_id)
    .maybeSingle();

  return (version as CourseVersionRow | null) ?? null;
}

async function getUserPinForCourse(
  supabase: SupabaseClient,
  userId: string,
  courseId: string
): Promise<CourseVersionRow | null> {
  const { data: pin } = await supabase
    .from("course_version_pins")
    .select("course_version_id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!pin?.course_version_id) return null;

  const { data: version } = await supabase
    .from("course_versions")
    .select("id, course_id, major_version, minor_version, release_notes, published_at, published_by")
    .eq("id", pin.course_version_id)
    .maybeSingle();

  return (version as CourseVersionRow | null) ?? null;
}

export type ResolveCourseVersionContext = {
  userId: string;
  enrollmentSource?: string | null;
  pathOrganizationId?: string | null;
};

/** Effective version a learner should see for one course. */
export async function resolveEffectiveCourseVersion(
  supabase: SupabaseClient,
  courseId: string,
  ctx: ResolveCourseVersionContext
): Promise<CourseVersionRow | null> {
  const authority = courseVersionAuthorityForEnrollment(ctx.enrollmentSource);

  if (authority === "user") {
    const userPin = await getUserPinForCourse(supabase, ctx.userId, courseId);
    if (userPin) return userPin;
  } else if (ctx.pathOrganizationId) {
    const orgPin = await getOrgPinForCourse(
      supabase,
      ctx.pathOrganizationId,
      courseId
    );
    if (orgPin) return orgPin;
    const userPin = await getUserPinForCourse(supabase, ctx.userId, courseId);
    if (userPin) return userPin;
  } else {
    const userPin = await getUserPinForCourse(supabase, ctx.userId, courseId);
    if (userPin) return userPin;
  }

  return getLatestCourseVersion(supabase, courseId);
}

export async function resolveEffectiveCourseVersionsForPath(
  supabase: SupabaseClient,
  trainingPathId: string,
  ctx: ResolveCourseVersionContext
): Promise<Map<string, CourseVersionRow>> {
  const courseIds = await listCourseIdsForTrainingPath(supabase, trainingPathId);
  const map = new Map<string, CourseVersionRow>();

  await Promise.all(
    courseIds.map(async (courseId) => {
      const version = await resolveEffectiveCourseVersion(supabase, courseId, ctx);
      if (version) map.set(courseId, version);
    })
  );

  return map;
}

/** Pin latest published versions for all courses in a path (on enrollment). */
export async function pinLatestCourseVersionsForPathEnrollment(options: {
  supabase: SupabaseClient;
  trainingPathId: string;
  userId: string;
  pinnedByUserId: string;
  enrollmentSource: string;
  pathOrganizationId: string | null;
}): Promise<void> {
  const courseIds = await listCourseIdsForTrainingPath(
    options.supabase,
    options.trainingPathId
  );
  if (courseIds.length === 0) return;

  const authority = courseVersionAuthorityForEnrollment(options.enrollmentSource);

  for (const courseId of courseIds) {
    const latest = await getLatestCourseVersion(options.supabase, courseId);
    if (!latest) continue;

    if (authority === "user") {
      const { data: existing } = await options.supabase
        .from("course_version_pins")
        .select("id")
        .eq("course_id", courseId)
        .eq("user_id", options.userId)
        .maybeSingle();

      const payload = {
        course_id: courseId,
        course_version_id: latest.id,
        user_id: options.userId,
        organization_id: null,
        pinned_by: options.pinnedByUserId,
        pinned_at: new Date().toISOString(),
      };

      if (existing?.id) {
        await options.supabase
          .from("course_version_pins")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await options.supabase.from("course_version_pins").insert(payload);
      }
    } else if (options.pathOrganizationId) {
      const { data: existing } = await options.supabase
        .from("course_version_pins")
        .select("id")
        .eq("course_id", courseId)
        .eq("organization_id", options.pathOrganizationId)
        .maybeSingle();

      const payload = {
        course_id: courseId,
        course_version_id: latest.id,
        organization_id: options.pathOrganizationId,
        user_id: null,
        pinned_by: options.pinnedByUserId,
        pinned_at: new Date().toISOString(),
      };

      if (existing?.id) {
        await options.supabase
          .from("course_version_pins")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await options.supabase.from("course_version_pins").insert(payload);
      }
    } else {
      const { data: existing } = await options.supabase
        .from("course_version_pins")
        .select("id")
        .eq("course_id", courseId)
        .eq("user_id", options.userId)
        .maybeSingle();

      const payload = {
        course_id: courseId,
        course_version_id: latest.id,
        user_id: options.userId,
        organization_id: null,
        pinned_by: options.pinnedByUserId,
        pinned_at: new Date().toISOString(),
      };

      if (existing?.id) {
        await options.supabase
          .from("course_version_pins")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await options.supabase.from("course_version_pins").insert(payload);
      }
    }
  }
}

type VersionLessonRow = Record<string, unknown> & {
  id: string;
  module_id: string;
  course_version_id: string;
};

/** Lessons from version snapshots for one course, ordered by module/lesson number. */
export async function fetchVersionLessonsForCourse(
  supabase: SupabaseClient,
  courseVersion: CourseVersionRow,
  options?: { includeHiddenModules?: boolean }
): Promise<VersionLessonRow[]> {
  const { data: modules } = await supabase
    .from("course_version_modules")
    .select("id, source_module_id, number, is_hidden_from_users")
    .eq("course_version_id", courseVersion.id)
    .order("number", { ascending: true });

  if (!modules?.length) return [];

  const ordered: VersionLessonRow[] = [];

  for (const mod of modules) {
    if (
      !options?.includeHiddenModules &&
      mod.is_hidden_from_users === true
    ) {
      continue;
    }

    const { data: rows } = await supabase
      .from("course_version_lessons")
      .select("*")
      .eq("course_version_module_id", mod.id)
      .order("number", { ascending: true });

    for (const row of rows ?? []) {
      const r = row as Record<string, unknown>;
      ordered.push({
        ...r,
        id: String(r.source_lesson_id),
        module_id: String(mod.source_module_id),
        course_version_id: courseVersion.id,
      });
    }
  }

  return ordered;
}

/** Lookup a single lesson row from the pinned version snapshot. */
export async function fetchVersionLessonBySourceId(
  supabase: SupabaseClient,
  courseVersionId: string,
  sourceLessonId: string
): Promise<VersionLessonRow | null> {
  const { data: modules } = await supabase
    .from("course_version_modules")
    .select("id, source_module_id")
    .eq("course_version_id", courseVersionId);

  const moduleIds = (modules ?? []).map((m) => m.id as string);
  if (moduleIds.length === 0) return null;

  const { data: row } = await supabase
    .from("course_version_lessons")
    .select("*")
    .in("course_version_module_id", moduleIds)
    .eq("source_lesson_id", sourceLessonId)
    .maybeSingle();

  if (!row) return null;

  const mod = (modules ?? []).find(
    (m) => m.id === (row as { course_version_module_id: string }).course_version_module_id
  );

  const r = row as Record<string, unknown>;
  return {
    ...r,
    id: String(r.source_lesson_id),
    module_id: mod ? String(mod.source_module_id) : "",
    course_version_id: courseVersionId,
  };
}

export async function findCourseVersionUpdatesForPath(
  supabase: SupabaseClient,
  trainingPathId: string,
  ctx: ResolveCourseVersionContext
): Promise<CourseVersionUpdateOffer[]> {
  const courseIds = await listCourseIdsForTrainingPath(supabase, trainingPathId);
  if (courseIds.length === 0) return [];

  const authority = courseVersionAuthorityForEnrollment(ctx.enrollmentSource);
  const offers: CourseVersionUpdateOffer[] = [];

  const { data: courses } = await supabase
    .from("courses")
    .select("id, name")
    .in("id", courseIds);

  const nameById = new Map(
    (courses ?? []).map((c) => [c.id as string, c.name as string])
  );

  for (const courseId of courseIds) {
    const latest = await getLatestCourseVersion(supabase, courseId);
    if (!latest) continue;

    const pinned = await resolveEffectiveCourseVersion(supabase, courseId, ctx);
    if (!pinned || !isNewerCourseVersion(latest, pinned)) continue;

    offers.push({
      courseId,
      courseName: nameById.get(courseId) ?? "Course",
      pinnedVersion: pinned,
      latestVersion: latest,
      authority,
    });
  }

  return offers;
}

/** Course id for a live lesson row. */
export async function resolveCourseIdForLesson(
  supabase: SupabaseClient,
  lessonId: string
): Promise<string | null> {
  const { data: lessonRow } = await supabase
    .from("lessons")
    .select("module_id")
    .eq("id", lessonId)
    .maybeSingle();

  if (!lessonRow?.module_id) return null;

  const { data: modRow } = await supabase
    .from("modules")
    .select("course_id")
    .eq("id", lessonRow.module_id)
    .maybeSingle();

  return (modRow?.course_id as string | null) ?? null;
}

export async function resolveCourseVersionForLessonSubmission(
  supabase: SupabaseClient,
  lessonId: string,
  ctx: ResolveCourseVersionContext
): Promise<CourseVersionRow | null> {
  const courseId = await resolveCourseIdForLesson(supabase, lessonId);
  if (!courseId) return null;
  return resolveEffectiveCourseVersion(supabase, courseId, ctx);
}

/** Build version resolution context from an enrollment row. */
export async function buildVersionContextForUserTraining(
  supabase: SupabaseClient,
  userId: string,
  ut: {
    training_path_id: string;
    enrollment_source?: string | null;
  }
): Promise<ResolveCourseVersionContext> {
  const { data: path } = await supabase
    .from("training_paths")
    .select("organization_id")
    .eq("id", ut.training_path_id)
    .maybeSingle();

  return {
    userId,
    enrollmentSource: ut.enrollment_source,
    pathOrganizationId: (path?.organization_id as string | null) ?? null,
  };
}
