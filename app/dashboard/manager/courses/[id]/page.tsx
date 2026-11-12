import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { managerListCourseVersions } from "@/app/actions/manager-course-versions";
import { listUnpublishedCourseware } from "@/lib/courseware-revisions";
import { CourseVersionsPanel } from "@/components/manager/course-versions-panel";
import { ManagerCourseDetailClient } from "@/components/manager/manager-course-detail-client";
import type { LessonMapModule } from "@/components/manager/lesson-map";
import { normalizeCatalogVisibility } from "@/lib/catalog-visibility";
import { getCourseOwnedByUser } from "@/lib/manager-training-guard";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ManagerCourseDetailPage({ params }: PageProps) {
  const { id } = await params;
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

  const modulesFull = await supabase
    .from("modules")
    .select("id, title, number, is_hidden_from_users, needs_setup")
    .eq("course_id", id)
    .order("number", { ascending: true });
  const modules =
    modulesFull.data ??
    (
      await supabase
        .from("modules")
        .select("id, title, number, is_hidden_from_users")
        .eq("course_id", id)
        .order("number", { ascending: true })
    ).data;

  const moduleIds = modules?.map((m) => m.id) ?? [];
  const { data: lessons } =
    moduleIds.length > 0
      ? await supabase
          .from("lessons")
          .select("id, module_id, number, title, courseware_revision")
          .in("module_id", moduleIds)
          .order("number", { ascending: true })
      : { data: [] as { id: string; module_id: string; number: number; title: string; courseware_revision?: number }[] };

  const moduleTree: LessonMapModule[] = (modules ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    number: m.number,
    isHiddenFromUsers: m.is_hidden_from_users === true,
    needsSetup: (m as { needs_setup?: boolean }).needs_setup === true,
    lessons: (lessons ?? [])
      .filter((l) => l.module_id === m.id)
      .map((l) => ({
        id: l.id,
        number: l.number,
        title: l.title,
        coursewareRevision: Number(l.courseware_revision ?? 0),
      })),
  }));

  const versionsResult = await managerListCourseVersions(id);
  const versions = versionsResult.ok ? versionsResult.versions : [];
  const unpublishedCourseware = await listUnpublishedCourseware(supabase, id);

  return (
    <ManagerCourseDetailClient
      course={{
        id: course.id,
        name: course.name,
        description: course.description,
        visibility: normalizeCatalogVisibility(course.visibility, "proprietary"),
      }}
      moduleTree={moduleTree}
      versionsPanel={
        <CourseVersionsPanel
          courseId={id}
          initialVersions={versions}
          unpublishedCourseware={unpublishedCourseware}
        />
      }
    />
  );
}
