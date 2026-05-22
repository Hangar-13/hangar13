import { getMyTrainingsPageData } from "@/app/actions/my-trainings";
import { MyTrainingsClient } from "@/components/student/my-trainings-client";
import { Button } from "@/components/ui/button";
import { redirectIfNoUserTrainings } from "@/lib/student-user-trainings-guard";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardContentFrame, DashboardPageShell } from "@/components/dashboard/page-shell";

export default async function CredentialsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  await redirectIfNoUserTrainings(user.id);

  const data = await getMyTrainingsPageData(user.id);

  return (
    <DashboardPageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">My Training Programs</h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            View programs you have completed, are enrolled in, and change which program is active
          </p>
        </div>
        <Button variant="secondary" asChild className="shrink-0">
          <Link href="/dashboard/student/find-training">Find Training</Link>
        </Button>
      </div>

      <DashboardContentFrame>
        <MyTrainingsClient
          inProgress={data.inProgress}
          completed={data.completed}
          currentUserTrainingId={data.currentUserTrainingId}
        />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}
