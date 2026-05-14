import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { ManagerCourseDetailClient } from "@/components/manager/manager-course-detail-client";
import type { LessonMapModule } from "@/components/manager/lesson-map";
import { normalizeCatalogVisibility } from "@/lib/catalog-visibility";
import { getCourseOwnedByUser } from "@/lib/manager-training-guard";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ editTalentLms?: string }>;
};

export default async function ManagerCourseDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const { editTalentLms } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const course = await getCourseOwnedByUser(supabase, id, user.id);
  if (!course) {
    notFound();
  }

  const { data: modules } = await supabase
    .from("modules")
    .select("id, title, number, is_hidden_from_users")
    .eq("course_id", id)
    .order("number", { ascending: true });

  const moduleIds = modules?.map((m) => m.id) ?? [];
  const { data: lessons } =
    moduleIds.length > 0
      ? await supabase
          .from("lessons")
          .select("id, module_id, number, title")
          .in("module_id", moduleIds)
          .order("number", { ascending: true })
      : { data: [] as { id: string; module_id: string; number: number; title: string }[] };

  const moduleTree: LessonMapModule[] = (modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    number: m.number,
    lessons: (lessons ?? []).filter((l) => l.module_id === m.id),
  }));

  return (
    <ManagerCourseDetailClient
      course={{
        id: course.id,
        name: course.name,
        description: course.description,
        visibility: normalizeCatalogVisibility(course.visibility, "proprietary"),
        talentLmsCourseId: course.talent_lms_course_id,
      }}
      moduleTree={moduleTree}
      focusTalentLmsCourseField={editTalentLms === "1"}
    />
  );
}
