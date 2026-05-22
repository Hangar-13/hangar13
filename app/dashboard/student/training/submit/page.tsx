import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { WeeklySubmissionForm } from "@/components/student/weekly-submission-form";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { redirectIfNoUserTrainings } from "@/lib/student-user-trainings-guard";
import { getWeeklySubmission } from "@/app/actions/weekly-submission";
import {
  fetchLessonsForTrainingPath,
  resolveLessonIdForProgramWeek,
} from "@/lib/training-lessons";
import { buildVersionContextForUserTraining } from "@/lib/course-versions";
import { computeProgramLessonWeek } from "@/lib/training-program-week";
import Link from "next/link";
import {
  DashboardAccentBlock,
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";

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

  const versionContext = await buildVersionContextForUserTraining(
    supabase,
    user.id,
    student
  );

  const lessonsOrdered = await fetchLessonsForTrainingPath(
    supabase,
    student.training_path_id,
    versionContext
  );
  const lessonCount = lessonsOrdered.length;

  const explicitWeek =
    typeof week === "number" && Number.isFinite(week) && week >= 1
      ? Math.floor(week)
      : undefined;

  const { currentWeek, totalWeeks } = computeProgramLessonWeek({
    startDateIso: student.start_date,
    lessonCount,
    explicitWeek,
  });

  if (lessonCount === 0 || currentWeek < 1) {
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Submission</h1>
        <p className="text-muted-foreground text-base">
          There are no lessons in your current training path yet. Add lessons to the
          program or choose another training path.
        </p>
      </div>
    );
  }

  const lessonId = await resolveLessonIdForProgramWeek(
    supabase,
    student,
    currentWeek,
    versionContext
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
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Weekly Submission</h1>
        <p className="text-base text-muted-foreground">
          {submission ? "Edit your Week" : "Submit your Week"} {currentWeek}{" "}
          reflection
        </p>
      </div>

      <DashboardContentFrame className="space-y-8">
        <DashboardAccentBlock>
          <div className="space-y-1">
            <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-foreground/70">
              Week {currentWeek} of {totalWeeks}
            </p>
            <p className="text-lg font-bold tracking-tight">
              {lessonRow?.title || "Training lesson"}
            </p>
          </div>
        </DashboardAccentBlock>

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
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}
