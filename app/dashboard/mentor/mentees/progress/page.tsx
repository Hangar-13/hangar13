import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { ProgressTrackingDashboard } from "@/components/apprentice/progress-tracking-dashboard";
import { ApprenticeProgressHeader } from "@/components/mentor/apprentice-progress-header";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForApprentice } from "@/app/actions/progress";

async function getMentorApprentices(mentorId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: apprentices, error } = await supabase
    .from("user_trainings")
    .select("id, user_id")
    .eq("mentor_id", mentorId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error || !apprentices?.length) {
    return [];
  }

  const userIds = apprentices.map((a) => a.user_id);
  const { data: userRows } = await supabase
    .from("users")
    .select("id, full_name")
    .in("id", userIds);

  const profileMap = Object.fromEntries(
    (userRows ?? []).map((p) => [p.id, p.full_name])
  );

  return apprentices.map((a) => ({
    id: a.id,
    full_name: profileMap[a.user_id] ?? null,
  }));
}

interface PageProps {
  searchParams: Promise<{ apprentice?: string }>;
}

export default async function MentorApprenticeProgressPage({
  searchParams,
}: PageProps) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { apprentice: apprenticeIdParam } = await searchParams;
  const apprentices = await getMentorApprentices(user.id);

  if (apprentices.length === 0) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Apprentice Progress
          </h1>
          <p className="text-muted-foreground text-base">
            You have no assigned apprentices. Assign apprentices from My
            Apprentices to view their progress.
          </p>
        </div>
      </div>
    );
  }

  const apprenticeId =
    apprenticeIdParam && apprentices.some((a) => a.id === apprenticeIdParam)
      ? apprenticeIdParam
      : apprentices[0].id;

  if (!apprenticeIdParam || apprenticeIdParam !== apprenticeId) {
    redirect(`/dashboard/mentor/mentees/progress?apprentice=${apprenticeId}`);
  }

  const { data: apprentice, error: apprenticeError } = await supabase
    .from("user_trainings")
    .select("*")
    .eq("id", apprenticeId)
    .single();

  if (apprenticeError || !apprentice || apprentice.mentor_id !== user.id) {
    redirect("/dashboard/mentor/mentees");
  }

  const [progressData, ataChapters] = await Promise.all([
    getProgressDataForApprentice(apprentice),
    getAtaChapters(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <ApprenticeProgressHeader
          apprentices={apprentices}
          currentApprenticeId={apprenticeId}
        />
        <p className="text-muted-foreground text-base">
          Track progress through the 30-month program
        </p>
      </div>

      <ProgressTrackingDashboard
        progressData={progressData}
        ataChapters={ataChapters.map((c) => ({
          chapter_number: c.chapter_number,
          title: c.title,
        }))}
      />
    </div>
  );
}
