import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserTrainingRow } from "@/lib/current-user-training";
import { fetchLessonsForEnrollment } from "@/lib/training-lessons";

/** Lesson ids with at least one non-draft submission (submitted_at set). */
export async function fetchSubmittedLessonIds(
  supabase: SupabaseClient,
  userTrainingId: string
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("lesson_submissions")
    .select("lesson_id")
    .eq("user_training_id", userTrainingId)
    .not("submitted_at", "is", null);

  if (error || !data) {
    return new Set();
  }

  return new Set(
    data.map((r) => r.lesson_id).filter((id): id is string => typeof id === "string")
  );
}

export type LessonProgressItem = {
  id: string;
  title?: string | null;
  status: string;
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
    .select("hours_completed, training_path_id")
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

  const trainingProgressPercent =
    hoursRequired > 0
      ? Math.min(100, Math.round((hoursCompleted / hoursRequired) * 100))
      : 0;

  const lessons = await fetchLessonsForEnrollment(supabase, ut);
  const submittedIds = await fetchSubmittedLessonIds(supabase, userTrainingId);

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
    const done = submittedIds.has(id);
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
      status: done ? "completed" : "not_started",
      hours_planned: planned,
      hours_spent: done ? planned : 0,
    };
  });

  const completedItems = itemsWithProgress.filter(
    (i) => i.status === "completed"
  ).length;

  return {
    itemsWithProgress,
    completedItems,
    totalItems: itemsWithProgress.length,
    hoursCompleted,
    hoursRequired,
    trainingProgressPercent,
  };
}
