import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { ProgressTrackingDashboard } from "@/components/student/progress-tracking-dashboard";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForStudent } from "@/app/actions/progress";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { redirectIfNoUserTrainings } from "@/lib/student-user-trainings-guard";
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

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!student) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
          <p className="text-muted-foreground text-base">
            No active training selected. Use{" "}
            <Link href="/dashboard/student/find-training" className="text-primary underline underline-offset-4">
              Find Training
            </Link>{" "}
            to choose a program.
          </p>
        </div>
      </div>
    );
  }

  const [progressData, ataChapters, planRow] = await Promise.all([
    getProgressDataForStudent(student),
    getAtaChapters(),
    supabase
      .from("training_paths")
      .select("name")
      .eq("id", student.training_path_id)
      .maybeSingle(),
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
