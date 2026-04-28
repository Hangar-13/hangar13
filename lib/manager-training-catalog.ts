import type { SupabaseClient } from "@supabase/supabase-js";
import { listOrganizationIdsWhereUserHasMinRole } from "@/lib/organization";

export type TrainingContentCatalogLesson = {
  id: string;
  moduleId: string;
  courseId: string;
  title: string;
  number: number;
  descriptionText: string;
};

export type TrainingContentCatalogModule = {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  number: number;
  lessons: TrainingContentCatalogLesson[];
};

export type TrainingContentCatalogCourse = {
  id: string;
  name: string;
  description: string | null;
  modules: TrainingContentCatalogModule[];
};

export async function buildTrainingContentCatalog(
  supabase: SupabaseClient,
  userId: string
): Promise<TrainingContentCatalogCourse[]> {
  const orgIds = await listOrganizationIdsWhereUserHasMinRole(
    supabase,
    userId,
    "mentor"
  );
  if (orgIds.length === 0) {
    return [];
  }

  const { data: courses } = await supabase
    .from("courses")
    .select("id, name, description")
    .in("organization_id", orgIds)
    .order("name", { ascending: true });

  if (!courses?.length) {
    return [];
  }

  const courseIds = courses.map((c) => c.id);

  const { data: modules } = await supabase
    .from("modules")
    .select("id, course_id, title, description, number")
    .in("course_id", courseIds)
    .order("number", { ascending: true });

  const moduleIds = (modules ?? []).map((m) => m.id);
  const { data: lessons } =
    moduleIds.length > 0
      ? await supabase
          .from("lessons")
          .select(
            "id, module_id, title, number, study_materials, practical_application"
          )
          .in("module_id", moduleIds)
          .order("number", { ascending: true })
      : { data: [] as Record<string, unknown>[] };

  const lessonsByModule = new Map<string, TrainingContentCatalogLesson[]>();
  for (const row of lessons ?? []) {
    const moduleId = row.module_id as string;
    const courseId =
      (modules ?? []).find((m) => m.id === moduleId)?.course_id ?? "";
    const study = (row.study_materials as string | null) ?? "";
    const practical = (row.practical_application as string | null) ?? "";
    const descriptionText = `${study} ${practical}`.trim();
    const lesson: TrainingContentCatalogLesson = {
      id: row.id as string,
      moduleId,
      courseId,
      title: row.title as string,
      number: row.number as number,
      descriptionText,
    };
    const list = lessonsByModule.get(moduleId) ?? [];
    list.push(lesson);
    lessonsByModule.set(moduleId, list);
  }

  const modulesByCourse = new Map<string, TrainingContentCatalogModule[]>();
  for (const m of modules ?? []) {
    const mod: TrainingContentCatalogModule = {
      id: m.id,
      courseId: m.course_id,
      title: m.title,
      description: m.description,
      number: m.number,
      lessons: lessonsByModule.get(m.id) ?? [],
    };
    const list = modulesByCourse.get(m.course_id) ?? [];
    list.push(mod);
    modulesByCourse.set(m.course_id, list);
  }

  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    modules: modulesByCourse.get(c.id) ?? [],
  }));
}
