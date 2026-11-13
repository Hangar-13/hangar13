import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserTrainingRow } from "@/lib/current-user-training";
import { optionalLessonIdsForUser } from "@/lib/prior-experience-lessons";
import { completedLessonIdSet, lessonCreditPercent } from "@/lib/training-lesson-state";
import { fetchLessonsForEnrollment } from "@/lib/training-lessons";

export type LessonProgressItem = {
  id: string;
  title?: string | null;
  /** completed = reflection submitted. optional = prior experience covers it and it was not submitted. */
  status: "completed" | "optional" | "not_started";
  /** True when prior experience covers this lesson, whether or not the student also finished it. */
  optional: boolean;
  category?: string | null;
  hours_spent: number;
  /** Planned hours from lessons.hours. */
  hours_planned: number;
};

function toNumberHours(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lesson-level progress for dashboards: completed = has a submitted lesson_submissions row.
 * Training progress as hours: hours_completed (user_trainings) vs total_hours on training_paths.
 */
export async function getEnrollmentLessonSnapshot(
  supabase: SupabaseClient,
  userTrainingId: string,
  ut: Pick<UserTrainingRow, "training_path_id">
): Promise<{
  itemsWithProgress: LessonProgressItem[];
  completedItems: number;
  totalItems: number;
  hoursCompleted: number;
  hoursRequired: number;
  trainingProgressPercent: number;
}> {
  const { data: utRow } = await supabase
    .from("user_trainings")
    .select("hours_completed, training_path_id, user_id, enrollment_source")
    .eq("id", userTrainingId)
    .maybeSingle();

  const hoursCompleted = toNumberHours(utRow?.hours_completed);
  let hoursRequired = 0;
  if (utRow?.training_path_id) {
    const { data: p } = await supabase
      .from("training_paths")
      .select("total_hours")
      .eq("id", utRow.training_path_id)
      .maybeSingle();
    hoursRequired = toNumberHours(p?.total_hours);
  }

  const lessons = await fetchLessonsForEnrollment(supabase, {
    ...ut,
    user_id: utRow?.user_id as string | undefined,
    enrollment_source: utRow?.enrollment_source as string | null | undefined,
  }, utRow?.user_id
    ? {
        userId: utRow.user_id as string,
        enrollmentSource: utRow.enrollment_source as string | null,
      }
    : undefined);
  const lessonInputs = lessons.flatMap((lesson) => {
    const id = lesson.id;
    if (typeof id !== "string" || !id) return [];
    return [
      {
        id,
        contentPackageId:
          typeof lesson.content_package_id === "string" ? lesson.content_package_id : null,
        testPackageId: typeof lesson.test_package_id === "string" ? lesson.test_package_id : null,
      },
    ];
  });
  const [completedIds, optionalIds] = utRow?.user_id
    ? await Promise.all([
        completedLessonIdSet(supabase, utRow.user_id as string, userTrainingId, lessonInputs),
        optionalLessonIdsForUser(
          supabase,
          utRow.user_id as string,
          lessonInputs.map((lesson) => lesson.id)
        ),
      ])
    : [new Set<string>(), new Set<string>()];

  const allAtaIds = new Set<number>();
  for (const lesson of lessons) {
    const raw = lesson.ata_chapter_ids as unknown;
    if (!Array.isArray(raw)) continue;
    for (const x of raw) {
      if (typeof x === "number") allAtaIds.add(x);
    }
  }
  let idToChapterNumber = new Map<number, string>();
  if (allAtaIds.size > 0) {
    const { data: chRows } = await supabase
      .from("ata_chapter")
      .select("id, chapter_number")
      .in("id", [...allAtaIds]);
    idToChapterNumber = new Map(
      (chRows ?? []).map((r) => [r.id as number, String(r.chapter_number)])
    );
  }

  const itemsWithProgress: LessonProgressItem[] = lessons.map((lesson) => {
    const id = String(lesson.id);
    const done = completedIds.has(id);
    const optional = optionalIds.has(id);
    const planned = toNumberHours(lesson.hours);
    const rawIds = lesson.ata_chapter_ids as unknown;
    let category: string | null = null;
    if (Array.isArray(rawIds) && rawIds.length) {
      const nums = rawIds.filter((x): x is number => typeof x === "number");
      const parts = nums
        .map((nid) => idToChapterNumber.get(nid))
        .filter((s): s is string => s != null && s.length > 0);
      category = parts.length > 0 ? parts.join(", ") : null;
    }
    if (
      category == null &&
      typeof lesson.ata_chapter === "string" &&
      lesson.ata_chapter
    ) {
      category = lesson.ata_chapter;
    }
    return {
      ...lesson,
      id,
      title: typeof lesson.title === "string" ? lesson.title : null,
      category,
      status: done ? "completed" : optional ? "optional" : "not_started",
      optional,
      hours_planned: planned,
      hours_spent: done ? planned : 0,
    };
  });

  const completedItems = itemsWithProgress.filter(
    (i) => i.status === "completed" || i.status === "optional"
  ).length;
  const trainingProgressPercent = lessonCreditPercent(
    itemsWithProgress.map((item) => ({
      completed: item.status === "completed",
      optional: item.optional && item.status !== "completed",
    }))
  );

  return {
    itemsWithProgress,
    completedItems,
    totalItems: itemsWithProgress.length,
    hoursCompleted,
    hoursRequired,
    trainingProgressPercent,
  };
}
