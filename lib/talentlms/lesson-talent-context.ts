import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildTalentLmsCoursePlayUrl,
  coerceTalentLmsCourseId,
  coerceTalentLmsUnitId,
} from "@/lib/talentlms/lesson-url";

export type LessonTalentContext = {
  talentUrl: string | null;
  courseId: string | null;
  unitId: string | null;
};

export type LessonTalentUnits = {
  courseId: string | null;
  unitId: string | null;
  testUnitId: string | null;
};

/**
 * Resolves Talent LMS course id (from the Hangar catalog course) and unit ids
 * (lesson field + optional test field).
 */
export async function resolveTalentLmsCourseAndUnitForLesson(
  supabase: SupabaseClient,
  lessonId: string
): Promise<LessonTalentUnits> {
  const { data: lessonRow } = await supabase
    .from("lessons")
    .select("talent_lms_unit_id, talent_lms_test_unit_id, module_id")
    .eq("id", lessonId)
    .maybeSingle();

  const unitId = coerceTalentLmsUnitId(
    typeof lessonRow?.talent_lms_unit_id === "string"
      ? lessonRow.talent_lms_unit_id
      : null
  );

  const testUnitId = coerceTalentLmsUnitId(
    typeof lessonRow?.talent_lms_test_unit_id === "string"
      ? lessonRow.talent_lms_test_unit_id
      : null
  );

  const moduleId = lessonRow?.module_id ?? null;
  const { data: modRow } = moduleId
    ? await supabase.from("modules").select("course_id").eq("id", moduleId).maybeSingle()
    : { data: null };

  const hangarCourseId = modRow?.course_id ?? null;
  const { data: courseRow } = hangarCourseId
    ? await supabase
        .from("courses")
        .select("talent_lms_course_id")
        .eq("id", hangarCourseId)
        .maybeSingle()
    : { data: null };

  const courseId = coerceTalentLmsCourseId(
    typeof courseRow?.talent_lms_course_id === "string"
      ? courseRow.talent_lms_course_id
      : null
  );

  return { courseId, unitId, testUnitId };
}

export async function getLessonTalentContext(
  supabase: SupabaseClient,
  lessonId: string
): Promise<LessonTalentContext> {
  const { courseId, unitId } = await resolveTalentLmsCourseAndUnitForLesson(
    supabase,
    lessonId
  );

  const subdomain = process.env.TALENTLMS_SUBDOMAIN?.trim() ?? "";

  const talentUrl =
    unitId && courseId && subdomain
      ? buildTalentLmsCoursePlayUrl({
          subdomain,
          courseId,
          unitId,
        })
      : null;

  return {
    talentUrl,
    courseId,
    unitId,
  };
}
