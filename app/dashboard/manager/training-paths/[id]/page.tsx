import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { buildTrainingContentCatalog } from "@/lib/manager-training-catalog";
import { ManagerTrainingPathDetailClient } from "@/components/manager/manager-training-path-detail-client";
import type { TrainingPathMapItem } from "@/components/manager/training-path-map";
import { getTrainingPathOwnedByUser } from "@/lib/manager-training-guard";
import { normalizeCatalogVisibility } from "@/lib/catalog-visibility";

type PageProps = { params: Promise<{ id: string }> };

export default async function ManagerTrainingPathDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const path = await getTrainingPathOwnedByUser(supabase, id, user.id);
  if (!path) {
    notFound();
  }

  const { data: rawItems } = await supabase
    .from("training_path_items")
    .select("id, sort_order, course_id, module_id, lesson_id")
    .eq("training_path_id", id)
    .order("sort_order", { ascending: true });

  const items = rawItems ?? [];

  const courseIds = [
    ...new Set(
      items.map((i) => i.course_id).filter((x): x is string => x != null)
    ),
  ];
  const moduleIds = [
    ...new Set(
      items.map((i) => i.module_id).filter((x): x is string => x != null)
    ),
  ];
  const lessonIds = [
    ...new Set(
      items.map((i) => i.lesson_id).filter((x): x is string => x != null)
    ),
  ];

  const [{ data: courseRows }, { data: moduleRows }, { data: lessonRows }] =
    await Promise.all([
      courseIds.length
        ? supabase.from("courses").select("id, name").in("id", courseIds)
        : { data: [] as { id: string; name: string }[] },
      moduleIds.length
        ? supabase
            .from("modules")
            .select("id, title, course_id")
            .in("id", moduleIds)
        : { data: [] as { id: string; title: string; course_id: string }[] },
      lessonIds.length
        ? supabase
            .from("lessons")
            .select("id, title, module_id")
            .in("id", lessonIds)
        : { data: [] as { id: string; title: string; module_id: string }[] },
    ]);

  const courseName = new Map((courseRows ?? []).map((c) => [c.id, c.name]));
  const moduleMeta = new Map(
    (moduleRows ?? []).map((m) => [m.id, { title: m.title, courseId: m.course_id }])
  );
  const lessonMeta = new Map(
    (lessonRows ?? []).map((l) => [l.id, { title: l.title, moduleId: l.module_id }])
  );

  const mapItems: TrainingPathMapItem[] = items.map((row) => {
    if (row.course_id) {
      return {
        itemId: row.id,
        sortOrder: row.sort_order,
        scope: "course",
        title: courseName.get(row.course_id) ?? "Course",
        courseId: row.course_id,
      };
    }
    if (row.module_id) {
      const m = moduleMeta.get(row.module_id);
      const cname = m ? courseName.get(m.courseId) : undefined;
      return {
        itemId: row.id,
        sortOrder: row.sort_order,
        scope: "module",
        title: m?.title ?? "Module",
        context: cname,
        courseId: m?.courseId,
        moduleId: row.module_id,
      };
    }
    const l = lessonMeta.get(row.lesson_id!);
    const m = l ? moduleMeta.get(l.moduleId) : undefined;
    const cname = m ? courseName.get(m.courseId) : undefined;
    return {
      itemId: row.id,
      sortOrder: row.sort_order,
      scope: "lesson",
      title: l?.title ?? "Lesson",
      context: cname ? (m?.title ? `${cname} · ${m.title}` : cname) : m?.title,
      courseId: m?.courseId,
      moduleId: l?.moduleId,
      lessonId: row.lesson_id!,
    };
  });

  const existingKeys: string[] = [];
  for (const row of items) {
    if (row.course_id) existingKeys.push(`c:${row.course_id}`);
    if (row.module_id) existingKeys.push(`m:${row.module_id}`);
    if (row.lesson_id) existingKeys.push(`l:${row.lesson_id}`);
  }

  const catalog = await buildTrainingContentCatalog(supabase, user.id);

  return (
    <ManagerTrainingPathDetailClient
      path={{
        id: path.id,
        name: path.name,
        description: path.description,
        visibility: normalizeCatalogVisibility(path.visibility, "public"),
        talentLmsCourseId: path.talent_lms_course_id ?? null,
      }}
      mapItems={mapItems}
      catalog={catalog}
      existingKeys={existingKeys}
    />
  );
}
