import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildVersionContextForUserTraining,
  formatCourseVersion,
  resolveEffectiveCourseVersionsForPath,
} from "@/lib/course-versions";
import { lessonPlayerStatusSatisfied } from "@/lib/lesson-player/progress";
import { fetchLessonsForEnrollment } from "@/lib/training-lessons";

export type CourseworkLesson = {
  id: string;
  title: string;
  awaitingReview: boolean;
  revision: number | null;
  submissionId: string | null;
};

export type CourseworkModule = {
  id: string;
  title: string;
  hidden: boolean;
  lessons: CourseworkLesson[];
};

export type CourseworkCourse = {
  id: string;
  name: string;
  versionLabel: string | null;
  completedAt: string | null;
  modules: CourseworkModule[];
};

type EnrollmentRef = {
  id: string;
  user_id: string;
  training_path_id: string;
  enrollment_source?: string | null;
};

function revisionFromCompletion(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const content = (raw as { content?: { status?: string; coursewareRevision?: number } }).content;
  if (!content || !lessonPlayerStatusSatisfied(content.status)) return null;
  const revision = Number(content.coursewareRevision ?? 0);
  return revision > 0 ? revision : null;
}

/** Submitted reflections for these learners, counted across their active enrollments. */
export async function pendingSubmissionCountsByUser(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (userIds.length === 0) return counts;

  const { data: enrollments } = await supabase
    .from("user_trainings")
    .select("id, user_id")
    .in("user_id", userIds)
    .eq("status", "active");

  const userByEnrollment = new Map(
    (enrollments ?? []).map((row) => [row.id as string, row.user_id as string])
  );
  const enrollmentIds = [...userByEnrollment.keys()];
  if (enrollmentIds.length === 0) return counts;

  const { data: submissions } = await supabase
    .from("lesson_submissions")
    .select("user_training_id")
    .in("user_training_id", enrollmentIds)
    .eq("status", "submitted");

  for (const row of submissions ?? []) {
    const userId = userByEnrollment.get(row.user_training_id as string);
    if (!userId) continue;
    counts.set(userId, (counts.get(userId) ?? 0) + 1);
  }
  return counts;
}

/** Courses in this enrollment, unfinished first, then most recently finished. */
export async function listStudentCoursework(
  supabase: SupabaseClient,
  enrollment: EnrollmentRef
): Promise<CourseworkCourse[]> {
  const versionContext = await buildVersionContextForUserTraining(
    supabase,
    enrollment.user_id,
    enrollment
  );
  const lessons = await fetchLessonsForEnrollment(supabase, enrollment, versionContext);
  const lessonIds = lessons
    .map((lesson) => lesson.id)
    .filter((id): id is string => typeof id === "string");
  if (lessonIds.length === 0) return [];

  const moduleIds = [
    ...new Set(
      lessons
        .map((lesson) => lesson.module_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const [{ data: modules }, { data: submissions }, { data: attempts }, versions] =
    await Promise.all([
      moduleIds.length
        ? supabase
            .from("modules")
            .select("id, title, number, is_hidden_from_users, course_id")
            .in("id", moduleIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("lesson_submissions")
        .select("id, lesson_id, status, approved_at, player_completion")
        .eq("user_training_id", enrollment.id)
        .in("lesson_id", lessonIds),
      supabase
        .from("lesson_player_attempts")
        .select("lesson_id, lesson_status, courseware_revision, updated_at")
        .eq("user_id", enrollment.user_id)
        .in("lesson_id", lessonIds),
      resolveEffectiveCourseVersionsForPath(
        supabase,
        enrollment.training_path_id,
        versionContext
      ),
    ]);

  const moduleById = new Map(
    (modules ?? []).map((mod) => [mod.id as string, mod])
  );
  const courseIds = [
    ...new Set(
      (modules ?? [])
        .map((mod) => mod.course_id as string | null)
        .filter((id): id is string => typeof id === "string")
    ),
  ];
  const { data: courses } =
    courseIds.length === 0
      ? { data: [] }
      : await supabase.from("courses").select("id, name").in("id", courseIds);
  const courseName = new Map(
    (courses ?? []).map((course) => [course.id as string, course.name as string])
  );

  const submissionByLesson = new Map(
    (submissions ?? []).map((row) => [row.lesson_id as string, row])
  );
  const revisionByLesson = new Map<string, number>();
  const newestAttempts = [...(attempts ?? [])].sort((a, b) =>
    String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""))
  );
  for (const row of newestAttempts) {
    const lessonId = row.lesson_id as string | null;
    if (!lessonId || revisionByLesson.has(lessonId)) continue;
    if (!lessonPlayerStatusSatisfied(row.lesson_status as string)) continue;
    const revision = Number(row.courseware_revision ?? 0);
    if (revision > 0) revisionByLesson.set(lessonId, revision);
  }

  type Draft = {
    id: string;
    pathIndex: number;
    modules: Map<string, CourseworkModule & { number: number }>;
  };
  const drafts = new Map<string, Draft>();

  lessons.forEach((lesson, index) => {
    const lessonId = typeof lesson.id === "string" ? lesson.id : null;
    const moduleId = typeof lesson.module_id === "string" ? lesson.module_id : "";
    if (!lessonId) return;
    const mod = moduleById.get(moduleId);
    const courseId = (mod?.course_id as string | undefined) ?? `lesson:${lessonId}`;
    let draft = drafts.get(courseId);
    if (!draft) {
      draft = { id: courseId, pathIndex: index, modules: new Map() };
      drafts.set(courseId, draft);
    }
    const moduleKey = moduleId || lessonId;
    let moduleDraft = draft.modules.get(moduleKey);
    if (!moduleDraft) {
      moduleDraft = {
        id: moduleKey,
        title: typeof mod?.title === "string" ? mod.title : "Module",
        hidden: Boolean(mod?.is_hidden_from_users),
        number: Number(mod?.number ?? index),
        lessons: [],
      };
      draft.modules.set(moduleKey, moduleDraft);
    }
    const submission = submissionByLesson.get(lessonId);
    const storedRevision = revisionFromCompletion(submission?.player_completion);
    moduleDraft.lessons.push({
      id: lessonId,
      title: typeof lesson.title === "string" ? lesson.title : "Lesson",
      awaitingReview: submission?.status === "submitted",
      revision: revisionByLesson.get(lessonId) ?? storedRevision,
      submissionId:
        submission?.status === "submitted" ? (submission.id as string) : null,
    });
  });

  const result: (CourseworkCourse & { pathIndex: number })[] = [...drafts.values()].map(
    (draft) => {
      const lessonRows = [...draft.modules.values()].flatMap((mod) => mod.lessons);
      const approvedAts = lessonRows.map((lesson) => {
        const submission = submissionByLesson.get(lesson.id);
        return submission?.status === "approved" ? (submission.approved_at as string | null) : null;
      });
      const complete =
        lessonRows.length > 0 && approvedAts.every((approvedAt) => approvedAt != null);
      const completedAt = complete
        ? approvedAts.filter((approvedAt): approvedAt is string => approvedAt != null).sort().at(-1) ??
          null
        : null;
      const version = versions.get(draft.id);
      return {
        id: draft.id,
        name: courseName.get(draft.id) ?? "Course",
        versionLabel: version
          ? formatCourseVersion(version.major_version, version.minor_version)
          : null,
        completedAt,
        pathIndex: draft.pathIndex,
        modules: [...draft.modules.values()]
          .sort((a, b) => a.number - b.number)
          .map(({ number: _number, ...mod }) => mod),
      };
    }
  );

  result.sort((a, b) => {
    if (a.completedAt == null && b.completedAt == null) return a.pathIndex - b.pathIndex;
    if (a.completedAt == null) return -1;
    if (b.completedAt == null) return 1;
    return b.completedAt.localeCompare(a.completedAt);
  });

  return result.map(({ pathIndex: _pathIndex, ...course }) => course);
}
