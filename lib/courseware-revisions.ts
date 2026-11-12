import type { SupabaseClient } from "@supabase/supabase-js";

import { formatCourseVersion, getLatestCourseVersion } from "@/lib/course-versions";

export type UnpublishedCourseware = {
  lessonId: string;
  lessonTitle: string;
  revision: number;
};

export type CourseRevisionBadge = {
  versionLabel: string | null;
  coursewareUpdated: boolean;
};

export async function listUnpublishedCourseware(
  supabase: SupabaseClient,
  courseId: string
): Promise<UnpublishedCourseware[]> {
  const { data: modules } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId);
  const moduleIds = (modules ?? []).map((m) => m.id as string);
  if (moduleIds.length === 0) return [];

  const { data: lessons } = await supabase
    .from("lessons")
    .select("id, title, number, courseware_revision")
    .in("module_id", moduleIds)
    .order("number", { ascending: true });

  const latest = await getLatestCourseVersion(supabase, courseId);
  const published = new Map<string, number>();
  if (latest) {
    const { data: versionModules } = await supabase
      .from("course_version_modules")
      .select("id")
      .eq("course_version_id", latest.id);
    const versionModuleIds = (versionModules ?? []).map((m) => m.id as string);
    if (versionModuleIds.length > 0) {
      const { data: versionLessons } = await supabase
        .from("course_version_lessons")
        .select("source_lesson_id, courseware_revision")
        .in("course_version_module_id", versionModuleIds);
      for (const row of versionLessons ?? []) {
        published.set(
          row.source_lesson_id as string,
          Number(row.courseware_revision ?? 0)
        );
      }
    }
  }

  return (lessons ?? [])
    .map((lesson) => ({
      lessonId: lesson.id as string,
      lessonTitle: String(lesson.title ?? "Lesson"),
      revision: Number(lesson.courseware_revision ?? 0),
      publishedRevision: published.get(lesson.id as string) ?? 0,
    }))
    .filter((lesson) => lesson.revision > lesson.publishedRevision)
    .map(({ lessonId, lessonTitle, revision }) => ({
      lessonId,
      lessonTitle,
      revision,
    }));
}

export async function courseRevisionBadges(
  supabase: SupabaseClient,
  courseIds: string[]
): Promise<Map<string, CourseRevisionBadge>> {
  const badges = new Map<string, CourseRevisionBadge>();
  if (courseIds.length === 0) return badges;

  const { data: versions } = await supabase
    .from("course_versions")
    .select("id, course_id, major_version, minor_version, published_at")
    .in("course_id", courseIds);

  const latestByCourse = new Map<
    string,
    { id: string; label: string; publishedAt: string }
  >();
  for (const row of versions ?? []) {
    const courseId = row.course_id as string;
    const publishedAt = String(row.published_at ?? "");
    const current = latestByCourse.get(courseId);
    if (current && current.publishedAt >= publishedAt) continue;
    latestByCourse.set(courseId, {
      id: row.id as string,
      label: formatCourseVersion(
        row.major_version as number,
        row.minor_version as number
      ),
      publishedAt,
    });
  }

  const { data: modules } = await supabase
    .from("modules")
    .select("id, course_id")
    .in("course_id", courseIds);
  const moduleCourse = new Map<string, string>();
  for (const mod of modules ?? []) {
    moduleCourse.set(mod.id as string, mod.course_id as string);
  }
  const moduleIds = [...moduleCourse.keys()];
  const liveRev = new Map<string, { courseId: string; revision: number }>();
  if (moduleIds.length > 0) {
    const { data: lessons } = await supabase
      .from("lessons")
      .select("id, module_id, courseware_revision")
      .in("module_id", moduleIds);
    for (const lesson of lessons ?? []) {
      const courseId = moduleCourse.get(lesson.module_id as string);
      if (!courseId) continue;
      liveRev.set(lesson.id as string, {
        courseId,
        revision: Number(lesson.courseware_revision ?? 0),
      });
    }
  }

  const publishedRev = new Map<string, number>();
  const latestVersionIds = [...latestByCourse.values()].map((v) => v.id);
  if (latestVersionIds.length > 0) {
    const { data: versionModules } = await supabase
      .from("course_version_modules")
      .select("id, course_version_id")
      .in("course_version_id", latestVersionIds);
    const versionIdByModule = new Map<string, string>();
    for (const mod of versionModules ?? []) {
      versionIdByModule.set(mod.id as string, mod.course_version_id as string);
    }
    const versionModuleIds = [...versionIdByModule.keys()];
    if (versionModuleIds.length > 0) {
      const { data: versionLessons } = await supabase
        .from("course_version_lessons")
        .select("course_version_module_id, source_lesson_id, courseware_revision")
        .in("course_version_module_id", versionModuleIds);
      for (const row of versionLessons ?? []) {
        publishedRev.set(
          `${versionIdByModule.get(row.course_version_module_id as string)}:${row.source_lesson_id}`,
          Number(row.courseware_revision ?? 0)
        );
      }
    }
  }

  for (const courseId of courseIds) {
    badges.set(courseId, {
      versionLabel: latestByCourse.get(courseId)?.label ?? null,
      coursewareUpdated: false,
    });
  }

  for (const [lessonId, live] of liveRev) {
    const latest = latestByCourse.get(live.courseId);
    const published = latest
      ? (publishedRev.get(`${latest.id}:${lessonId}`) ?? 0)
      : 0;
    if (live.revision > published) {
      const badge = badges.get(live.courseId);
      if (badge) badge.coursewareUpdated = true;
    }
  }

  return badges;
}
