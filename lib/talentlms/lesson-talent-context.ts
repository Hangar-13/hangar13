import type { SupabaseClient } from "@supabase/supabase-js";

import {
  extractFirstTalentLmsUrlFromMarkdown,
  parseTalentLmsCourseAndUnitFromUrl,
} from "@/lib/talentlms/lesson-url";

export type LessonTalentContext = {
  talentUrl: string | null;
  courseId: string | null;
  unitId: string | null;
};

export async function getLessonTalentContext(
  supabase: SupabaseClient,
  lessonId: string,
  trainingPathId: string
): Promise<LessonTalentContext> {
  const [{ data: lessonRow }, { data: pathRow }] = await Promise.all([
    supabase
      .from("lessons")
      .select("study_materials, practical_application, weekly_deliverable")
      .eq("id", lessonId)
      .maybeSingle(),
    supabase
      .from("training_paths")
      .select("talent_lms_course_id")
      .eq("id", trainingPathId)
      .maybeSingle(),
  ]);

  const markdownBlob = [
    lessonRow?.study_materials,
    lessonRow?.practical_application,
    lessonRow?.weekly_deliverable,
  ]
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .join("\n\n");

  const talentUrl = extractFirstTalentLmsUrlFromMarkdown(markdownBlob);
  const parsed = talentUrl
    ? parseTalentLmsCourseAndUnitFromUrl(talentUrl)
    : { courseId: null, unitId: null };

  const pathCourseId =
    typeof pathRow?.talent_lms_course_id === "string" &&
    pathRow.talent_lms_course_id.trim()
      ? pathRow.talent_lms_course_id.trim()
      : null;

  const courseId = parsed.courseId ?? pathCourseId;

  return {
    talentUrl,
    courseId,
    unitId: parsed.unitId,
  };
}
