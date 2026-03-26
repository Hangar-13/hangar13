import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { ProgressTrackingDashboard } from "@/components/apprentice/progress-tracking-dashboard";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForApprentice } from "@/app/actions/progress";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { redirectIfNoUserTrainings } from "@/lib/apprentice-user-trainings-guard";
import Link from "next/link";

export default async function ProgressPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  await redirectIfNoUserTrainings(user.id);

  const { userTraining: apprentice } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!apprentice) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
          <p className="text-muted-foreground text-base">
            No active training selected. Use{" "}
            <Link href="/dashboard/apprentice/find-training" className="text-primary underline underline-offset-4">
              Find Training
            </Link>{" "}
            to choose a program.
          </p>
        </div>
      </div>
    );
  }

  const [progressData, ataChapters, planRow] = await Promise.all([
    getProgressDataForApprentice(apprentice),
    getAtaChapters(),
    apprentice.training_plan_id
      ? supabase
          .from("training_plans")
          .select("name")
          .eq("id", apprentice.training_plan_id)
          .maybeSingle()
      : Promise.resolve({ data: null as { name: string } | null }),
  ]);

  const pageTitle = planRow.data?.name ?? "Progress";

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
        <p className="text-muted-foreground text-base">
          Track your progress through the 30-month program
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
