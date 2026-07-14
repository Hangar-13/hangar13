import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { StudentEntriesList } from "@/components/mentor/student-entries-list";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import {
  getCertificationAwardsForUser,
  getTrainingCompletionsForUser,
} from "@/app/actions/user-credentials";
import { CredentialsReadOnlyLists } from "@/components/user/credentials-read-only-lists";
import {
  DashboardContentFrame,
  DashboardPageShell,
  DashboardSectionLabel,
  DashboardStatCell,
  DashboardStatStrip,
} from "@/components/dashboard/page-shell";
import { User, Mail, Calendar, ArrowLeft, ArrowRight, CheckCircle, AlertCircle, TrendingUp, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getEnrollmentLessonSnapshot } from "@/lib/training-progress";
import { formatUiDate } from "@/lib/format-ui-date";
import { mentorHasAccessToTrainee } from "@/lib/mentor-enrollments";
import { fetchLessonsForEnrollment } from "@/lib/training-lessons";
import { buildVersionContextForUserTraining } from "@/lib/course-versions";
import { computeProgramLessonWeek } from "@/lib/training-program-week";
import { LessonDiscussion } from "@/components/discussion/lesson-discussion";
import { getLessonDiscussion } from "@/app/actions/lesson-discussion";

async function getStudentData(studentId: string, mentorId: string) {
  const supabase = await createServerSupabaseClient();

  // Avoid users(...) embed here: RLS on users can fail when assignment is profile-only
  // (users.mentor_id) but enrollment.mentor_id is null, which can empty the whole row.
  const { data: student, error: studentError } = await supabase
    .from("user_trainings")
    .select("*")
    .eq("id", studentId)
    .maybeSingle();

  if (studentError || !student) {
    return null;
  }

  // Verify the mentor has permission to view this student
  const allowed = await mentorHasAccessToTrainee(supabase, mentorId, student.user_id);
  if (!allowed) {
    return { unauthorized: true };
  }

  // Get student profile
  const { data: profile } = await supabase
    .from("users")
    .select("id, email, full_name, avatar_url")
    .eq("id", student.user_id)
    .single();

  // Get all logbook entries for this student
  const { data: entries, error: entriesError } = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("user_id", student.user_id)
    .order("entry_date", { ascending: false });

  // Categorize entries by status
  const entriesByStatus = {
    submitted: entries?.filter((e) => e.status === "submitted") || [],
    approved: entries?.filter((e) => e.status === "approved") || [],
    rejected: entries?.filter((e) => e.status === "rejected") || [],
    draft: entries?.filter((e) => e.status === "draft") || [],
  };

  // Calculate progress stats
  const now = new Date();
  const targetHours = 5200;

  // Calculate total hours
  const totalHours = entries?.reduce(
    (sum, entry) => sum + Number(entry.hours_worked || 0),
    0
  ) || 0;

  // Calculate current week (weeks since start date)
  const startDate = new Date(student.start_date);
  const daysSinceStart = Math.floor(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

  // Calculate expected hours (assuming 40 hours per week average)
  const expectedHoursPerWeek = 40;
  const expectedHours = currentWeek * expectedHoursPerWeek;

  // Calculate hours progress
  const hoursProgress = (totalHours / targetHours) * 100;
  const expectedProgress = (expectedHours / targetHours) * 100;
  let progressStatus: "on_track" | "behind_pace" | "ahead" = "on_track";
  
  if (hoursProgress < expectedProgress - 10) {
    progressStatus = "behind_pace";
  } else if (hoursProgress > expectedProgress + 10) {
    progressStatus = "ahead";
  }

  const {
    hoursCompleted,
    hoursRequired,
    trainingProgressPercent,
  } = await getEnrollmentLessonSnapshot(supabase, student.id, student);

  return {
    student: {
      ...student,
      profile,
    },
    entries: entries || [],
    entriesByStatus,
    progress: {
      overall: trainingProgressPercent,
      hoursCompleted,
      hoursRequired,
    },
    hours: {
      total: totalHours,
      target: targetHours,
      progress: Math.round(hoursProgress),
    },
    weeks: {
      current: currentWeek,
    },
    progressStatus,
    pendingEntries: entriesByStatus.submitted.length,
  };
}

type StudentEnrollment = {
  id: string;
  user_id: string;
  mentor_id: string | null;
  start_date: string;
  training_path_id: string;
  enrollment_source?: string | null;
};

async function getStudentDiscussionData(
  studentRow: StudentEnrollment,
  weekParam?: number
) {
  const supabase = await createServerSupabaseClient();

  const versionContext = await buildVersionContextForUserTraining(
    supabase,
    studentRow.user_id,
    studentRow
  );

  const lessonsOrdered = await fetchLessonsForEnrollment(
    supabase,
    studentRow,
    versionContext
  );
  const lessonCount = lessonsOrdered.length;

  if (lessonCount === 0) {
    return null;
  }

  const { currentWeek, totalWeeks } = computeProgramLessonWeek({
    startDateIso: studentRow.start_date,
    lessonCount,
    explicitWeek:
      typeof weekParam === "number" && Number.isFinite(weekParam) && weekParam >= 1
        ? Math.floor(weekParam)
        : undefined,
  });

  const lessonRow = lessonsOrdered[currentWeek - 1] as
    | Record<string, unknown>
    | undefined;
  const lessonId =
    lessonRow && typeof lessonRow.id === "string" ? lessonRow.id : null;
  const questions = Array.isArray(lessonRow?.mentor_discussion_questions)
    ? (lessonRow!.mentor_discussion_questions as unknown[]).filter(
        (q): q is string => typeof q === "string"
      )
    : [];
  const lessonTitle =
    lessonRow && typeof lessonRow.title === "string" ? lessonRow.title : null;

  const discussion = lessonId
    ? await getLessonDiscussion(studentRow.id, lessonId)
    : null;

  return {
    currentWeek,
    totalWeeks,
    lessonId,
    questions,
    lessonTitle,
    discussion,
  };
}

interface PageProps {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    week?: string;
    question?: string;
  }>;
}

export default async function StudentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const data = await getStudentData(id, user.id);

  if (!data) {
    notFound();
  }

  if ((data as any).unauthorized) {
    redirect("/dashboard/mentor");
  }

  const { student, entries, entriesByStatus, progress, hours, weeks, progressStatus, pendingEntries } = data;

  const studentUserId = student.profile?.id;
  const [ataChapters, acsCodesByEntry, trainingCompletions, certificationAwards] = await Promise.all([
    getAtaChapters(),
    entries && entries.length > 0 ? getAcsCodesByEntry(entries.map((e: { id: string }) => e.id)) : Promise.resolve({}),
    studentUserId ? getTrainingCompletionsForUser(studentUserId) : Promise.resolve([]),
    studentUserId ? getCertificationAwardsForUser(studentUserId) : Promise.resolve([]),
  ]);
  const profile = student.profile;

  const weekParam = sp.week && /^\d+$/.test(sp.week) ? parseInt(sp.week, 10) : undefined;
  const openQuestionIndex =
    sp.question != null && /^\d+$/.test(sp.question)
      ? parseInt(sp.question, 10)
      : null;
  const discussionData = await getStudentDiscussionData(
    {
      id: student.id,
      user_id: student.user_id,
      mentor_id: student.mentor_id,
      start_date: student.start_date,
      training_path_id: student.training_path_id,
      enrollment_source: student.enrollment_source,
    },
    weekParam
  );

  const discPrevWeek =
    discussionData && discussionData.currentWeek > 1
      ? discussionData.currentWeek - 1
      : null;
  const discNextWeek =
    discussionData && discussionData.currentWeek < discussionData.totalWeeks
      ? discussionData.currentWeek + 1
      : null;

  const getStatusBadge = (status?: "on_track" | "behind_pace" | "ahead") => {
    switch (status) {
      case "on_track":
        return (
          <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 font-medium flex items-center gap-1 whitespace-nowrap" style={{ fontSize: '0.625rem' }}>
            <CheckCircle className="h-2.5 w-2.5" />
            On Track
          </span>
        );
      case "behind_pace":
        return (
          <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium flex items-center gap-1 whitespace-nowrap" style={{ fontSize: '0.625rem' }}>
            <AlertCircle className="h-2.5 w-2.5" />
            Behind Pace
          </span>
        );
      case "ahead":
        return (
          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 font-medium flex items-center gap-1 whitespace-nowrap" style={{ fontSize: '0.625rem' }}>
            <TrendingUp className="h-2.5 w-2.5" />
            Ahead
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <DashboardPageShell>
      <div className="flex items-start gap-4">
        <Link href="/dashboard/mentor/mentees">
          <Button variant="ghost" size="icon" className="mt-1">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-start gap-6">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">
                {profile?.full_name || "Student"}
              </h1>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{profile?.email}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Started {formatUiDate(student.start_date)}</span>
                  </div>
                  {student.end_date && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Ended {formatUiDate(student.end_date)}</span>
                    </div>
                  )}
                  <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                    {student.status}
                  </span>
                </div>
              </div>
            </div>
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name || "Student"}
                className="h-16 w-16 rounded-full flex-shrink-0"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-8 w-8 text-primary" />
              </div>
            )}
          </div>
        </div>
      </div>

      <DashboardContentFrame>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <DashboardSectionLabel>Progress overview</DashboardSectionLabel>
          <div className="flex flex-wrap gap-2">
            {studentUserId ? (
              <Link href={`/dashboard/skills/${studentUserId}`}>
                <Button variant="outline" size="sm">
                  Skills profile
                </Button>
              </Link>
            ) : null}
            <Link href={`/dashboard/mentor/mentees/progress?student=${student.id}`}>
              <Button variant="outline" size="sm">
                Student Progress
              </Button>
            </Link>
          </div>
        </div>

        <DashboardStatStrip>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-border/30">
            <div className="min-w-0 space-y-2 px-4 first:pl-0 last:pr-0 sm:px-5">
              <DashboardStatCell
                value={`${progress?.overall ?? 0}%`}
                label="Training progress"
                detail={
                  progress && progress.hoursRequired > 0
                    ? `${progress.hoursCompleted.toFixed(1)} / ${progress.hoursRequired.toFixed(1)} training hours`
                    : "No training hours defined for this program"
                }
              />
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${progress?.overall ?? 0}%` }}
                />
              </div>
            </div>
            <DashboardStatCell
              value={`Week ${weeks?.current ?? 0}`}
              label="Current week"
              detail={`Started ${formatUiDate(student.start_date)}`}
            />
            <div className="min-w-0 space-y-2 px-4 first:pl-0 last:pr-0 sm:px-5">
              <DashboardStatCell
                value={`${(hours?.total ?? 0).toFixed(1)} / ${hours?.target ?? 0}`}
                label="Hours progress"
                detail={`${hours?.progress ?? 0}% complete`}
              />
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(hours?.progress ?? 0, 100)}%` }}
                />
              </div>
              <div>{getStatusBadge(progressStatus)}</div>
            </div>
            <DashboardStatCell
              value={pendingEntries ?? 0}
              label="Pending entries"
              detail="Awaiting approval"
              className={(pendingEntries ?? 0) > 0 ? "[&>p:first-child]:text-primary" : undefined}
            />
          </div>
        </DashboardStatStrip>

        <section className="space-y-4 border-t border-border/40 pt-6">
          <DashboardSectionLabel>Training & certifications</DashboardSectionLabel>
          <CredentialsReadOnlyLists
            trainingCompletions={trainingCompletions}
            certificationAwards={certificationAwards}
            emptyHint="No completed trainings or certifications on file yet."
          />
        </section>

        <section className="space-y-4 border-t border-border/40 pt-6">
          <StudentEntriesList
            entries={entries || []}
            entriesByStatus={
              entriesByStatus || {
                submitted: [],
                approved: [],
                rejected: [],
                draft: [],
              }
            }
            acsCodesByEntry={acsCodesByEntry || {}}
            ataChapters={ataChapters.map((c: { chapter_number: string; title: string }) => ({
              value: c.chapter_number,
              label: `${c.chapter_number} - ${c.title}`,
            }))}
          />
        </section>

        {discussionData ? (
          <section className="space-y-4 border-t border-border/40 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <DashboardSectionLabel>
                <span className="inline-flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Questions for Mentor Discussion
                </span>
              </DashboardSectionLabel>
              <div className="flex items-center gap-3 text-sm">
                {discPrevWeek ? (
                  <Link
                    href={`/dashboard/mentor/student/${student.id}?week=${discPrevWeek}`}
                    className="flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Prev</span>
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground/40">
                    <ArrowLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Prev</span>
                  </span>
                )}
                <span className="font-semibold tabular-nums text-foreground">
                  Week {discussionData.currentWeek}
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    of {discussionData.totalWeeks}
                  </span>
                </span>
                {discNextWeek ? (
                  <Link
                    href={`/dashboard/mentor/student/${student.id}?week=${discNextWeek}`}
                    className="flex items-center gap-1 font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground/40">
                    <span className="hidden sm:inline">Next</span>
                    <ArrowRight className="h-4 w-4" />
                  </span>
                )}
              </div>
            </div>

            {discussionData.lessonTitle ? (
              <p className="text-sm text-muted-foreground">
                {discussionData.lessonTitle}
              </p>
            ) : null}

            {discussionData.lessonId ? (
              <LessonDiscussion
                userTrainingId={student.id}
                lessonId={discussionData.lessonId}
                questions={discussionData.questions}
                programWeek={discussionData.currentWeek}
                initial={discussionData.discussion}
                openQuestionIndex={openQuestionIndex}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                No lesson content available for this week.
              </p>
            )}
          </section>
        ) : null}
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}

