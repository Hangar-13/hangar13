import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { FindTrainingProgramsClient } from "@/components/student/find-training-programs-client";
import {
  discoverableTrainingPathsOrFilter,
  listUserOrganizationIds,
} from "@/lib/discoverable-training-paths";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";

export default async function FindTrainingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const orgIds = await listUserOrganizationIds(supabase, user.id);
  const orFilter = discoverableTrainingPathsOrFilter(orgIds);

  const [{ data: plans, error: plansError }, { data: enrollments }] =
    await Promise.all([
      supabase
        .from("training_paths")
        .select("id, name, description, total_hours, visibility, monetization")
        .eq("is_active", true)
        .or(orFilter)
        .order("name", { ascending: true }),
      supabase.from("user_trainings").select("training_path_id").eq("user_id", user.id),
    ]);

  if (plansError) {
    console.error("FindTrainingPage training_paths:", plansError);
  }

  const enrolledPlanIds =
    enrollments?.flatMap((e) =>
      e.training_path_id ? [e.training_path_id] : []
    ) ?? [];

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Find Training</h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Browse available training modules.
        </p>
      </div>

      {plansError ? (
        <p className="text-sm text-muted-foreground">
          Could not load training programs. Try again later.
        </p>
      ) : (
        <DashboardContentFrame>
          <FindTrainingProgramsClient
            plans={plans ?? []}
            enrolledPlanIds={enrolledPlanIds}
          />
        </DashboardContentFrame>
      )}
    </DashboardPageShell>
  );
}
