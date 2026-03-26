import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { WeeklySubmissionForm } from "@/components/apprentice/weekly-submission-form";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { redirectIfNoUserTrainings } from "@/lib/apprentice-user-trainings-guard";
import Link from "next/link";

async function getApprenticeTrainingData(userId: string, week: number = 1) {
  const supabase = await createServerSupabaseClient();

  const { userTraining: apprentice } = await getCurrentUserTrainingContext(supabase, userId);

  if (!apprentice) {
    return null;
  }

  // Get curriculum items for the current week
  const { data: curriculumItems } = await supabase
    .from("curriculum_items")
    .select("*")
    .eq("is_active", true)
    .order("order_index", { ascending: true })
    .limit(1);

  const currentItem = curriculumItems?.[0];

  return {
    apprentice,
    currentWeek: week,
    totalWeeks: 130,
    currentItem,
  };
}

interface PageProps {
  searchParams: Promise<{
    week?: string;
  }>;
}

export default async function WeeklySubmissionPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  await redirectIfNoUserTrainings(user.id);

  const params = await searchParams;
  const week = params.week ? parseInt(params.week) : undefined;

  // Calculate current week if not provided
  const data = await getApprenticeTrainingData(user.id, week);
  
  if (!data) {
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Submission</h1>
        <p className="text-muted-foreground text-base">
          No active training selected. Use{" "}
          <Link href="/dashboard/apprentice/find-training" className="text-primary underline underline-offset-4">
            Find Training
          </Link>{" "}
          to choose a program.
        </p>
      </div>
    );
  }

  // Calculate current week if not provided
  let currentWeek = week;
  if (!currentWeek) {
    const now = new Date();
    const startDate = new Date(data.apprentice.start_date);
    const daysSinceStart = Math.floor(
      (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
  }

  // Get existing submission if it exists
  const { data: submission } = await supabase
    .from("weekly_submissions")
    .select(
      `
      *,
      weekly_submission_files (*)
    `
    )
    .eq("user_training_id", data.apprentice.id)
    .eq("week_number", currentWeek)
    .maybeSingle();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Submission</h1>
        <p className="text-muted-foreground text-base">
          {submission ? "Edit your Week" : "Submit your Week"} {currentWeek} reflection
        </p>
      </div>

      {/* Current Week Information */}
      <div className="bg-[#FAF5E6] border-l-4 border-[#8B4513] rounded-lg p-6">
        <div className="flex items-start gap-4">
          <svg
            className="h-6 w-6 text-[#8B4513] mt-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="space-y-1">
            <p className="text-base font-medium text-[#8B4513]">
              Week {currentWeek} of {data.totalWeeks}
            </p>
            <p className="text-lg font-semibold text-[#5D4037]">
              {data.currentItem?.title || "Safety, Ground Operations & Servicing"}
            </p>
          </div>
        </div>
      </div>

      {/* Submission Form */}
      <WeeklySubmissionForm
        weekNumber={currentWeek}
        curriculumItemId={data.currentItem?.id}
        initialData={submission ? {
          reflectionText: submission.reflection_text || "",
          files: submission.weekly_submission_files || [],
        } : undefined}
      />
    </div>
  );
}
