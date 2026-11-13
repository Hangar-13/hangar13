import type { SupabaseClient } from "@supabase/supabase-js";
import { lessonPlayerStatusSatisfied } from "@/lib/lesson-player/progress";
import { optionalLessonIdsForUser } from "@/lib/prior-experience-lessons";

export type TrainingLessonInput = {
  id: string;
  title: string;
  number: number;
  contentPackageId?: string | null;
  testPackageId?: string | null;
};

export type TrainingLessonState = {
  id: string;
  title: string;
  number: number;
  /**
   * The current courseware and test (when those exist) are passed, and a
   * reflection has been submitted. An older pass of a replaced file does not count.
   */
  completed: boolean;
  /** Covered by prior experience, so it is not required. */
  optional: boolean;
};

function packageId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * First lesson that still has to be done: not finished, and not optional
 * because of prior experience. 1-based. Null when every lesson is finished or optional.
 */
export function firstActionableWeek(
  lessons: Array<Pick<TrainingLessonState, "completed" | "optional">>
): number | null {
  const index = lessons.findIndex((lesson) => !lesson.completed && !lesson.optional);
  return index === -1 ? null : index + 1;
}

/** Share of the course already credited: finished lessons plus prior-experience lessons. */
export function lessonCreditPercent(
  lessons: Array<Pick<TrainingLessonState, "completed" | "optional">>
): number {
  if (lessons.length === 0) return 0;
  const credited = lessons.filter((lesson) => lesson.completed || lesson.optional).length;
  return Math.round((credited / lessons.length) * 100);
}

/** Lessons whose current courseware, test, and reflection are all finished. */
export async function completedLessonIdSet(
  supabase: SupabaseClient,
  userId: string,
  userTrainingId: string,
  lessons: Array<Pick<TrainingLessonInput, "id" | "contentPackageId" | "testPackageId">>
): Promise<Set<string>> {
  const ids = lessons.map((lesson) => lesson.id).filter((id) => id.length > 0);
  if (ids.length === 0) return new Set();

  const [{ data: submissions }, { data: liveLessons }, { data: attempts }] = await Promise.all([
    supabase
      .from("lesson_submissions")
      .select("lesson_id")
      .eq("user_training_id", userTrainingId)
      .not("submitted_at", "is", null),
    supabase
      .from("lessons")
      .select("id, content_package_id, test_package_id")
      .in("id", ids),
    supabase
      .from("lesson_player_attempts")
      .select("package_id, lesson_status")
      .eq("user_id", userId)
      .in("lesson_id", ids),
  ]);

  const submitted = new Set(
    (submissions ?? [])
      .map((row) => row.lesson_id)
      .filter((id): id is string => typeof id === "string")
  );
  const liveById = new Map(
    (liveLessons ?? []).map((row) => [row.id as string, row])
  );
  const satisfiedPackages = new Set(
    (attempts ?? [])
      .filter(
        (row) =>
          packageId(row.package_id) != null &&
          lessonPlayerStatusSatisfied(row.lesson_status as string | null)
      )
      .map((row) => row.package_id as string)
  );

  const completed = new Set<string>();
  for (const lesson of lessons) {
    if (!submitted.has(lesson.id)) continue;
    const live = liveById.get(lesson.id);
    const contentId = packageId(lesson.contentPackageId) ?? packageId(live?.content_package_id);
    const testId = packageId(lesson.testPackageId) ?? packageId(live?.test_package_id);
    if (contentId && !satisfiedPackages.has(contentId)) continue;
    if (testId && !satisfiedPackages.has(testId)) continue;
    completed.add(lesson.id);
  }
  return completed;
}

export async function loadTrainingLessonStates(
  supabase: SupabaseClient,
  userId: string,
  userTrainingId: string,
  lessons: TrainingLessonInput[]
): Promise<TrainingLessonState[]> {
  if (lessons.length === 0) return [];

  const [completedIds, optionalIds] = await Promise.all([
    completedLessonIdSet(supabase, userId, userTrainingId, lessons),
    optionalLessonIdsForUser(
      supabase,
      userId,
      lessons.map((lesson) => lesson.id)
    ),
  ]);

  return lessons.map((lesson) => ({
    id: lesson.id,
    title: lesson.title,
    number: lesson.number,
    completed: completedIds.has(lesson.id),
    optional: optionalIds.has(lesson.id),
  }));
}
