import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { WeeklySubmissionForm } from "@/components/student/weekly-submission-form";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { redirectIfNoUserTrainings } from "@/lib/student-user-trainings-guard";
import { getWeeklySubmission } from "@/app/actions/weekly-submission";
import { resolveLessonIdForProgramWeek } from "@/lib/training-lessons";
import Link from "next/link";

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

  const { userTraining: student } = await getCurrentUserTrainingContext(
    supabase,
    user.id
  );

  if (!student) {
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Submission</h1>
        <p className="text-muted-foreground text-base">
          No active training selected. Use{" "}
          <Link
            href="/dashboard/student/find-training"
            className="text-primary underline underline-offset-4"
          >
            Find Training
          </Link>{" "}
          to choose a program.
        </p>
      </div>
    );
  }

  let currentWeek = week;
  if (!currentWeek) {
    const now = new Date();
    const startDate = new Date(student.start_date);
    const daysSinceStart = Math.floor(
      (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
  }

  const totalWeeks = 130;

  const lessonId = await resolveLessonIdForProgramWeek(
    supabase,
    student,
    currentWeek
  );

  const { data: lessonRow } = lessonId
    ? await supabase.from("lessons").select("title").eq("id", lessonId).maybeSingle()
    : { data: null };

  const subResult = await getWeeklySubmission(currentWeek);
  if ("error" in subResult && subResult.error) {
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Submission</h1>
        <p className="text-muted-foreground text-base">{subResult.error}</p>
      </div>
    );
  }

  const submission =
    "submission" in subResult ? subResult.submission : null;

  const files =
    submission &&
    Array.isArray(
      (submission as { lesson_submission_files?: unknown }).lesson_submission_files
    )
      ? (submission as { lesson_submission_files: Array<{
          id: string;
          file_url: string;
          file_name: string;
          file_size: number;
          file_type: string | null;
        }> }).lesson_submission_files
      : [];

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Submission</h1>
        <p className="text-muted-foreground text-base">
          {submission ? "Edit your Week" : "Submit your Week"} {currentWeek}{" "}
          reflection
        </p>
      </div>

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
              Week {currentWeek} of {totalWeeks}
            </p>
            <p className="text-lg font-semibold text-[#5D4037]">
              {lessonRow?.title || "Training lesson"}
            </p>
          </div>
        </div>
      </div>

      <WeeklySubmissionForm
        weekNumber={currentWeek}
        initialData={
          submission
            ? {
                reflectionText: (submission.reflection_text as string) || "",
                files: files as {
                  id: string;
                  file_url: string;
                  file_name: string;
                  file_size: number;
                  file_type: string | null;
                }[],
              }
            : undefined
        }
      />
    </div>
  );
}
