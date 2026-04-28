import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { getAllAcsCodesWithChapters } from "@/app/actions/acs-codes";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { ManagerModuleDetailClient } from "@/components/manager/manager-module-detail-client";
import type { LessonMapModule } from "@/components/manager/lesson-map";
import { getCourseOwnedByUser } from "@/lib/manager-training-guard";

type PageProps = { params: Promise<{ id: string; moduleId: string }> };

export default async function ManagerModuleDetailPage({ params }: PageProps) {
  const { id: courseId, moduleId } = await params;
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
    .select("id, course_id, title, description, is_hidden_from_users")
    .eq("id", moduleId)
    .maybeSingle();

  if (!module || module.course_id !== courseId) {
    notFound();
  }

  const { count: moduleCount, error: moduleCountError } = await supabase
    .from("modules")
    .select("*", { count: "exact", head: true })
    .eq("course_id", courseId);

  if (moduleCountError) {
    console.error("ManagerModuleDetailPage module count:", moduleCountError);
  }

  const isSoleModuleInCourse =
    typeof moduleCount === "number" && moduleCount === 1;

  const { data: modLessons } = await supabase
    .from("lessons")
    .select("id, module_id, number, title")
    .eq("module_id", moduleId)
    .order("number", { ascending: true });

  const moduleTree: LessonMapModule[] = [
    {
      id: module.id,
      title: module.title,
      number: 0,
      lessons: modLessons ?? [],
    },
  ];

  const weekNums = (modLessons ?? []).map((l) => l.number);
  const suggestedWeekNumber =
    weekNums.length > 0 ? Math.max(...weekNums) + 1 : 1;

  const { data: orderedCourseModules } = await supabase
    .from("modules")
    .select("id")
    .eq("course_id", courseId)
    .order("number", { ascending: true });

  const moduleIndex =
    (orderedCourseModules ?? []).findIndex((r) => r.id === moduleId) + 1;

  const acsCatalogRaw = await getAllAcsCodesWithChapters();
  const acsCodeCatalog = acsCatalogRaw.map((c) => ({
    id: c.id,
    code: c.code,
    domain: c.domain,
    subject: c.subject,
    description: c.description,
    ata_chapter_numbers: c.ata_chapter_numbers,
  }));

  const ataChapters = await getAtaChapters();
  const ataChapterCatalog = ataChapters.map((c) => ({
    id: c.id,
    chapter_number: c.chapter_number,
    title: c.title,
    description: c.description,
  }));

  return (
    <ManagerModuleDetailClient
      course={{ id: course.id, name: course.name }}
      moduleIndex={moduleIndex}
      module={{
        id: module.id,
        title: module.title,
        description: module.description,
        is_hidden_from_users: module.is_hidden_from_users,
      }}
      moduleTree={moduleTree}
      suggestedWeekNumber={suggestedWeekNumber}
      isSoleModuleInCourse={isSoleModuleInCourse}
      acsCodeCatalog={acsCodeCatalog}
      ataChapterCatalog={ataChapterCatalog}
    />
  );
}
