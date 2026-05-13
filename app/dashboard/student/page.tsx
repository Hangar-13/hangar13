import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/student/progress-bar";
import { CurrentTrainingCard } from "@/components/student/current-training-card";
import { HoursProgressCard } from "@/components/student/hours-progress-card";
import { MetricCards } from "@/components/student/metric-cards";
import { RecentActivityCard } from "@/components/student/recent-activity-card";
import { FileText } from "lucide-react";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import {
  getCertificationAwardsForUser,
  getTrainingCompletionsForUser,
} from "@/app/actions/user-credentials";
import { CredentialsSummaryCard } from "@/components/student/credentials-summary-card";
import { getEnrollmentLessonSnapshot } from "@/lib/training-progress";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";
import { queryLogbookEntriesForOwner, type LogbookEntryRow } from "@/lib/logbook-entries-query";
import { fetchLessonsForTrainingPath } from "@/lib/training-lessons";
import {
  computeProgramLessonWeek,
  DEFAULT_FULL_PROGRAM_LOGBOOK_HOURS,
} from "@/lib/training-program-week";

function ataChaptersTouchedFromLogbook(
  entries: { skills_practiced?: unknown }[]
): number {
  const padChapter = (ch: string) =>
    ch.length === 1 && /^\d$/.test(ch) ? "0" + ch : ch;
  const chapters = new Set<string>();
  for (const entry of entries) {
    const skills = entry.skills_practiced;
    if (!Array.isArray(skills)) continue;
    for (const skill of skills) {
      if (typeof skill !== "string") continue;
      const m = skill.match(/ATA:\s*(\d+)\s*-/);
      if (m) chapters.add(padChapter(m[1]));
    }
  }
  return chapters.size;
}

async function getUserProfile(userId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== userId) {
    return null;
  }

  const profile = await fetchSessionUserProfile(supabase);
  if (!profile) {
    console.warn(
      "getUserProfile: no public.users row for auth id (apply database migrations or check on_auth_user_created)",
      { userId }
    );
    return null;
  }

  return { full_name: profile.full_name };
}

function mapLogbookRowsForRecentActivity(
  rows: Array<Record<string, unknown>>
): Array<{
  id: string;
  entry_date: string;
  description: string;
  hours_worked: number;
}> {
  return rows.map((row) => ({
    id: String(row.id ?? ""),
    entry_date: String(row.entry_date ?? ""),
    description: String(row.description ?? ""),
    hours_worked: Number(row.hours_worked ?? 0),
  }));
}

async function getStudentData(userId: string) {
  const supabase = await createServerSupabaseClient();

  const [{ userTraining: activeStudent }, { data: utRows }] = await Promise.all([
    getCurrentUserTrainingContext(supabase, userId),
    supabase
      .from("user_trainings")
      .select("*")
      .eq("user_id", userId)
      .order("start_date", { ascending: false }),
  ]);

  const { data: logbookData, error: logbookErr } =
    await queryLogbookEntriesForOwner(supabase, userId);
  if (logbookErr) {
    console.error("getStudentData logbook_entries:", logbookErr.message);
  }

  const allLogbookRows: LogbookEntryRow[] = logbookData ?? [];

  const recentLogbookEntries = mapLogbookRowsForRecentActivity(
    [...allLogbookRows]
      .sort(
        (a, b) =>
          new Date(String(b.entry_date)).getTime() -
          new Date(String(a.entry_date)).getTime()
      )
      .slice(0, 5)
  );

  const totalHours =
    allLogbookRows.reduce((sum, entry) => sum + Number(entry.hours_worked || 0), 0) ||
    0;

  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const thisWeekHours =
    allLogbookRows
      .filter((entry) => new Date(String(entry.entry_date)) >= startOfWeek)
      .reduce((sum, entry) => sum + Number(entry.hours_worked || 0), 0) || 0;

  const anchorForLessons = activeStudent ?? utRows?.[0] ?? null;

  if (!anchorForLessons) {
    const ataTouched = ataChaptersTouchedFromLogbook(allLogbookRows);
    return {
      hasActiveCurriculum: false,
      trainingPlanName: null as string | null,
      curriculumItems: [],
      logbookEntries: recentLogbookEntries,
      progress: {
        trainingPercent: 0,
        hoursCompleted: 0,
        hoursRequired: 0,
        lessonsCompleted: 0,
        lessonsTotal: 0,
      },
      hours: {
        total: totalHours,
        thisWeek: thisWeekHours,
        target: DEFAULT_FULL_PROGRAM_LOGBOOK_HOURS,
      },
      weeks: {
        current: 0,
        total: 0,
      },
      currentTraining: {
        topic: "Select a training program to track weekly curriculum",
        dueDate: undefined as Date | undefined,
      },
      ataChapters: {
        completed: ataTouched,
        total: 43,
      },
    };
  }

  const student = anchorForLessons;

  const {
    itemsWithProgress,
    completedItems,
    totalItems,
    hoursCompleted,
    hoursRequired,
    trainingProgressPercent,
  } = await getEnrollmentLessonSnapshot(supabase, student.id, student);

  const uniqueCategories = new Set(
    itemsWithProgress
      .map((item) => item.category)
      .filter((cat): cat is string => !!cat)
  );
  const completedCategories = new Set(
    itemsWithProgress
      .filter((item) => item.status === "completed")
      .map((item) => item.category)
      .filter((cat): cat is string => !!cat)
  );

  let ataCompleted = completedCategories.size;
  let ataTotal = uniqueCategories.size || 43;
  if (totalItems === 0) {
    ataCompleted = ataChaptersTouchedFromLogbook(allLogbookRows);
    ataTotal = 43;
  }

  const lessonsOrdered = await fetchLessonsForTrainingPath(
    supabase,
    student.training_path_id
  );
  const lessonCount = lessonsOrdered.length;
  const { currentWeek, totalWeeks } = computeProgramLessonWeek({
    startDateIso: student.start_date,
    lessonCount,
  });

  const startDate = new Date(student.start_date);

  const currentTrainingItem = itemsWithProgress.find(
    (item) => item.status !== "completed"
  );

  const dueDate = new Date(startDate);
  if (currentWeek > 0) {
    dueDate.setDate(startDate.getDate() + currentWeek * 7 - 1);
  }

  let trainingPlanName: string | null = null;
  const { data: pathRow } = await supabase
    .from("training_paths")
    .select("name")
    .eq("id", student.training_path_id)
    .maybeSingle();
  trainingPlanName = pathRow?.name ?? null;

  return {
    hasActiveCurriculum: !!activeStudent,
    trainingPlanName,
    curriculumItems: itemsWithProgress,
    logbookEntries: recentLogbookEntries,
    progress: {
      trainingPercent: trainingProgressPercent,
      hoursCompleted,
      hoursRequired,
      lessonsCompleted: completedItems,
      lessonsTotal: totalItems,
    },
    hours: {
      total: totalHours,
      thisWeek: thisWeekHours,
      target: DEFAULT_FULL_PROGRAM_LOGBOOK_HOURS,
    },
    weeks: {
      current: currentWeek,
      total: totalWeeks,
    },
    currentTraining: {
      topic:
        currentTrainingItem?.title ||
        "Safety, Ground Operations & Servicing",
      dueDate,
    },
    ataChapters: {
      completed: ataCompleted,
      total: ataTotal,
    },
  };
}

export default async function StudentDashboard() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Auth error:", userError);
    redirect("/auth/login");
  }

  const profile = await getUserProfile(user.id);

  if (!profile) {
    return (
      <div className="space-y-3 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight">
          Your account profile could not be loaded
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Try signing out and signing back in. If this message persists, the database may not have run
          migrations that create a profile when you sign up (for example the{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">on_auth_user_created</code> trigger on{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">auth.users</code>). Apply pending Supabase
          migrations, then sign up again or ask an administrator to verify your account.
        </p>
      </div>
    );
  }

  const firstName = profile.full_name?.split(" ")[0] || "there";

  const [data, trainings, certifications] = await Promise.all([
    getStudentData(user.id),
    getTrainingCompletionsForUser(user.id),
    getCertificationAwardsForUser(user.id),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-muted-foreground text-base">
            {data.hasActiveCurriculum ? (
              "Keep up the great work on your aviation journey"
            ) : (
              <>
                Log OJT hours anytime; when enrolled, set a current program in{" "}
                <Link
                  href="/dashboard/student/credentials"
                  className="text-primary underline underline-offset-4"
                >
                  My Training Programs
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/dashboard/student/logbook?add=true">+ Log Entry</Link>
          </Button>
          {data.hasActiveCurriculum && data.weeks.total > 0 && data.weeks.current > 0 ? (
            <Button asChild variant="outline">
              <Link href={`/dashboard/student/training/submit?week=${data.weeks.current}`}>
                <FileText className="mr-2 h-4 w-4" />
                Submit Week
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2 -mt-4">
        <ProgressBar
          percent={data.progress.trainingPercent}
          summary={
            data.progress.hoursRequired > 0
              ? `${data.progress.hoursCompleted.toFixed(1)} / ${data.progress.hoursRequired.toFixed(1)} training hours`
              : null
          }
          trainingProgramName={data.trainingPlanName}
        />

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CurrentTrainingCard
              currentWeek={data.weeks.current}
              totalWeeks={data.weeks.total}
              topic={data.currentTraining.topic}
              dueDate={data.currentTraining.dueDate}
            />
          </div>
          <div className="lg:col-span-1">
            <HoursProgressCard
              completedHours={data.hours.total}
              targetHours={data.hours.target}
              status={data.hours.thisWeek === 0 ? "behind" : "on_pace"}
            />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <MetricCards
          totalHours={data.hours.total}
          targetHours={data.hours.target}
          thisWeekHours={data.hours.thisWeek}
          currentWeek={data.weeks.current}
          totalWeeks={data.weeks.total}
          ataChaptersCompleted={data.ataChapters.completed}
          totalAtaChapters={data.ataChapters.total}
        />
      </div>

      <CredentialsSummaryCard
        trainingCount={trainings.length}
        certificationCount={certifications.length}
      />

      <RecentActivityCard entries={data.logbookEntries} />
    </div>
  );
}
