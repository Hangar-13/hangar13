import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { FindTrainingProgramsClient } from "@/components/apprentice/find-training-programs-client";

export default async function FindTrainingPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [{ data: plans, error: plansError }, { data: enrollments }] =
    await Promise.all([
      supabase
        .from("training_plans")
        .select("id, name, description, total_weeks")
        .eq("is_active", true)
        .order("name", { ascending: true }),
      supabase
        .from("user_trainings")
        .select("training_plan_id")
        .eq("user_id", user.id),
    ]);

  if (plansError) {
    console.error("FindTrainingPage training_plans:", plansError);
  }

  const enrolledPlanIds =
    enrollments
      ?.map((e) => e.training_plan_id)
      .filter((id): id is string => id != null) ?? [];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Find Training</h1>
        <p className="text-muted-foreground text-base max-w-2xl">
          Browse available training modules.
        </p>
      </div>

      {plansError ? (
        <p className="text-sm text-muted-foreground">
          Could not load training programs. Try again later.
        </p>
      ) : (
        <FindTrainingProgramsClient
          plans={plans ?? []}
          enrolledPlanIds={enrolledPlanIds}
        />
      )}
    </div>
  );
}
