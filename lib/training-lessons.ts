import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserTrainingRow } from "@/lib/current-user-training";

/** Lessons for a course, ordered by module number then lesson number. */
export async function fetchLessonsForCourse(
  supabase: SupabaseClient,
  courseId: string
): Promise<Record<string, unknown>[]> {
  const { data: modules, error: mErr } = await supabase
    .from("modules")
    .select("id, number, is_hidden_from_users")
    .eq("course_id", courseId)
    .order("number", { ascending: true });

  if (mErr || !modules?.length) {
    return [];
  }

  const ordered: Record<string, unknown>[] = [];

  for (const m of modules) {
    const { data: rows } = await supabase
      .from("lessons")
      .select("*")
      .eq("module_id", m.id)
      .order("number", { ascending: true });
    if (rows?.length) {
      ordered.push(...(rows as Record<string, unknown>[]));
    }
  }

  return ordered;
}

/**
 * Program week index (1-based) maps to the Nth lesson in path expansion order
 * (`fetchLessonsForTrainingPath`), not to `lessons.number` within a single course.
 */
export async function resolveLessonIdForProgramWeek(
  supabase: SupabaseClient,
  ut: Pick<UserTrainingRow, "training_path_id">,
  weekNumber: number
): Promise<string | null> {
  if (!ut.training_path_id) {
    return null;
  }

  const lessons = await fetchLessonsForTrainingPath(
    supabase,
    ut.training_path_id
  );
  if (lessons.length === 0) {
    return null;
  }

  const w = Math.min(Math.max(weekNumber, 1), lessons.length);
  const row = lessons[w - 1];
  const id = row["id"];
  return typeof id === "string" ? id : null;
}

/**
 * All catalog lessons for an enrollment: either a full course, or a training path
 * (path items expanded in sort_order; duplicate lesson ids skipped).
 */
export async function fetchLessonsForEnrollment(
  supabase: SupabaseClient,
  ut: Pick<UserTrainingRow, "training_path_id">
) {
  return fetchLessonsForTrainingPath(supabase, ut.training_path_id);
}

export async function fetchLessonsForTrainingPath(
  supabase: SupabaseClient,
  trainingPathId: string
) {
  const { data: items, error } = await supabase
    .from("training_path_items")
    .select("course_id, module_id, lesson_id, sort_order")
    .eq("training_path_id", trainingPathId)
    .order("sort_order", { ascending: true });

  if (error || !items?.length) {
    return [];
  }

  const seen = new Set<string>();
  const ordered: Record<string, unknown>[] = [];

  for (const item of items) {
    if (item.lesson_id) {
      if (seen.has(item.lesson_id)) continue;
      const { data: les } = await supabase
        .from("lessons")
        .select("*")
        .eq("id", item.lesson_id)
        .maybeSingle();
      if (les) {
        seen.add(les.id);
        ordered.push(les as Record<string, unknown>);
      }
      continue;
    }
    if (item.module_id) {
      const { data: modLessons } = await supabase
        .from("lessons")
        .select("*")
        .eq("module_id", item.module_id)
        .order("number", { ascending: true });
      for (const les of modLessons || []) {
        if (!seen.has(les.id)) {
          seen.add(les.id);
          ordered.push(les as Record<string, unknown>);
        }
      }
      continue;
    }
    if (item.course_id) {
      const courseLessons = await fetchLessonsForCourse(supabase, item.course_id);
      for (const les of courseLessons) {
        const lid = les["id"];
        if (typeof lid !== "string") continue;
        if (!seen.has(lid)) {
          seen.add(lid);
          ordered.push(les);
        }
      }
    }
  }

  return ordered;
}
