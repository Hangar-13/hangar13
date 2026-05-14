import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTalentLmsCoursePlayUrl,
  coerceTalentLmsUnitId,
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
      .select(
        "talent_lms_unit_id, study_materials, practical_application, weekly_deliverable"
      )
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

  const extractedUrl =
    extractFirstTalentLmsUrlFromMarkdown(markdownBlob);
  const parsedFromMarkdown = extractedUrl
    ? parseTalentLmsCourseAndUnitFromUrl(extractedUrl)
    : { courseId: null, unitId: null };

  const pathCourseId =
    typeof pathRow?.talent_lms_course_id === "string" &&
    pathRow.talent_lms_course_id.trim()
      ? pathRow.talent_lms_course_id.trim()
      : null;

  const unitFromLesson = coerceTalentLmsUnitId(
    typeof lessonRow?.talent_lms_unit_id === "string"
      ? lessonRow.talent_lms_unit_id
      : null
  );

  const subdomain = process.env.TALENTLMS_SUBDOMAIN?.trim() ?? "";

  const courseId =
    pathCourseId ?? parsedFromMarkdown.courseId ?? null;

  const unitId =
    unitFromLesson ?? parsedFromMarkdown.unitId ?? null;

  let talentUrl: string | null = null;

  const courseForPlayUrl =
    pathCourseId ?? parsedFromMarkdown.courseId ?? null;

  if (unitFromLesson && courseForPlayUrl && subdomain) {
    talentUrl = buildTalentLmsCoursePlayUrl({
      subdomain,
      courseId: courseForPlayUrl,
      unitId: unitFromLesson,
    });
  } else {
    talentUrl = extractedUrl;
  }

  return {
    talentUrl,
    courseId,
    unitId,
  };
}
