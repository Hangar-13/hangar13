import { notFound, redirect } from "next/navigation";

import { LessonPlayerFrame } from "@/components/lesson-player/lesson-player-frame";
import { getLessonPlayerLaunch, safeReturnPath } from "@/lib/lesson-player";
import type { LessonPackageKind } from "@/lib/lesson-player";
import { createServerSupabaseClient } from "@/lib/supabase-server";

type PageProps = {
  params: Promise<{ lessonId: string }>;
  searchParams: Promise<{ kind?: string; return?: string; courseVersion?: string }>;
};

export default async function LessonPlayerPage({ params, searchParams }: PageProps) {
  const { lessonId } = await params;
  const query = await searchParams;
  const kind: LessonPackageKind = query.kind === "test" ? "test" : "content";
  const returnPath = safeReturnPath(query.return, "/dashboard/student/training");

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("id", user.id)
    .maybeSingle();

  const launch = await getLessonPlayerLaunch(supabase, {
    lessonId,
    userId: user.id,
    kind,
    courseVersionId: query.courseVersion ?? null,
    fullName: typeof profile?.full_name === "string" ? profile.full_name : null,
    email: profile?.email || user.email,
  });

  if (!launch) notFound();

  return (
    <LessonPlayerFrame
      title={launch.title}
      packageId={launch.packageId}
      launchPath={launch.launchPath}
      resumeKey={launch.resumeKey}
      sittingId={launch.sittingId}
      initialCmi={launch.initialCmi}
      returnPath={returnPath}
    />
  );
}
