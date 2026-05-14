import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { getAllAcsCodesWithChapters } from "@/app/actions/acs-codes";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { ManagerLessonDetailClient } from "@/components/manager/manager-lesson-detail-client";
import { getCourseOwnedByUser } from "@/lib/manager-training-guard";

type PageProps = {
  params: Promise<{ id: string; moduleId: string; lessonId: string }>;
};

export default async function ManagerLessonDetailPage({ params }: PageProps) {
  const { id: courseId, moduleId, lessonId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const course = await getCourseOwnedByUser(supabase, courseId, user.id);
  if (!course) {
    notFound();
  }

  const { data: module } = await supabase
    .from("modules")
    .select("id, course_id, title")
    .eq("id", moduleId)
    .maybeSingle();

  if (!module || module.course_id !== courseId) {
    notFound();
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("*")
    .eq("id", lessonId)
    .maybeSingle();

  if (!lesson || lesson.module_id !== moduleId) {
    notFound();
  }

  const { data: orderedCourseModules } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId)
    .order("number", { ascending: true });

  const moduleIndexInCourse =
    (orderedCourseModules ?? []).findIndex((r) => r.id === moduleId) + 1;
  const moduleTitleInBar =
    moduleIndexInCourse > 0
      ? `${moduleIndexInCourse} - ${module.title}`
      : module.title;

  const acsCatalogRaw = await getAllAcsCodesWithChapters();
  const acsCodeCatalog = acsCatalogRaw.map((c) => ({
    id: c.id,
    code: c.code,
    domain: c.domain,
    subject: c.subject,
    description: c.description,
    ata_chapter_numbers: c.ata_chapter_numbers,
  }));

  const rawAcs = lesson.acs_codes as unknown;
  const acsCodes =
    Array.isArray(rawAcs) && rawAcs.every((x: unknown) => typeof x === "number")
      ? (rawAcs as number[])
      : [];

  const rawAta = lesson.ata_chapter_ids as unknown;
  const ataChapterIds =
    Array.isArray(rawAta) && rawAta.every((x: unknown) => typeof x === "number")
      ? (rawAta as number[])
      : [];

  const ataChapters = await getAtaChapters();
  const ataChapterCatalog = ataChapters.map((c) => ({
    id: c.id,
    chapter_number: c.chapter_number,
    title: c.title,
    description: c.description,
  }));

  return (
    <ManagerLessonDetailClient
      courseId={courseId}
      courseName={course.name}
      moduleId={moduleId}
      moduleTitle={moduleTitleInBar}
      lesson={{
        id: lesson.id,
        number: lesson.number,
        title: lesson.title,
        hours: Number((lesson as { hours?: unknown }).hours ?? 0),
        ata_chapter_ids: ataChapterIds,
        acs_codes: acsCodes,
        learning_objectives: lesson.learning_objectives ?? [],
        talent_lms_lesson_url:
          typeof (lesson as { talent_lms_lesson_url?: unknown }).talent_lms_lesson_url ===
          "string"
            ? (lesson as { talent_lms_lesson_url: string }).talent_lms_lesson_url
            : null,
        study_materials: lesson.study_materials,
        practical_application: lesson.practical_application,
        mentor_discussion_questions: lesson.mentor_discussion_questions ?? [],
        weekly_deliverable: lesson.weekly_deliverable,
      }}
      lessonTitleInBar={`${lesson.number} - ${lesson.title}`}
      acsCodeCatalog={acsCodeCatalog}
      ataChapterCatalog={ataChapterCatalog}
    />
  );
}
