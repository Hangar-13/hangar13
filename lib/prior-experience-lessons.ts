import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Lessons this student is not required to complete because prior experience
 * already covers them.
 *
 * Prior experience records which topics a student has already proven. The
 * map from those topics onto lessons in a course is not built yet, so this
 * returns an empty set. Course progress, the training contents list, and
 * "next lesson" all treat whatever this returns as optional and already credited.
 */
export async function optionalLessonIdsForUser(
  _supabase: SupabaseClient,
  _userId: string,
  _lessonIds: string[]
): Promise<Set<string>> {
  return new Set();
}
