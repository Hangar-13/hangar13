import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  BookOpen,
  Calendar,
  FileText,
  Target,
  Clock,
  MessageSquare,
  ArrowLeft,
  ArrowRight,
  Edit,
  Percent,
  CheckCircle,
} from "lucide-react";
import { CollapsibleSection } from "@/components/student/collapsible-section";
import { LessonMarkdownBody } from "@/components/student/lesson-markdown-body";
import { LessonDiscussion } from "@/components/discussion/lesson-discussion";
import { getLessonDiscussion } from "@/app/actions/lesson-discussion";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { redirectIfNoUserTrainings } from "@/lib/student-user-trainings-guard";
import {
  fetchLessonsForTrainingPath,
  resolveLessonIdForProgramWeek,
} from "@/lib/training-lessons";
import {
  buildVersionContextForUserTraining,
  formatCourseVersion,
} from "@/lib/course-versions";
import {
  fetchTalentLessonProgressSnapshot,
  type TalentLessonProgressSnapshot,
} from "@/lib/talentlms/fetch-lesson-progress";
import { coerceTalentLmsUnitId } from "@/lib/talentlms/lesson-url";
import { LessonProgressCard } from "@/components/student/lesson-progress-card";
import { computeProgramLessonWeek } from "@/lib/training-program-week";
import { formatUiDate, formatUiDateTime } from "@/lib/format-ui-date";
import { CourseVersionUpdateBanner } from "@/components/student/course-version-update-banner";
import { getCourseVersionUpdatesForCurrentEnrollment } from "@/app/actions/course-version-adoption";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";

async function getStudentTrainingData(userId: string, week?: number) {
  const supabase = await createServerSupabaseClient();

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, userId);

  if (!student) {
    return null;
  }

  const startDate = new Date(student.start_date);

  let trainingPlanName: string | null = null;

  const { data: pathMeta } = await supabase
    .from("training_paths")
    .select("name, organization_id")
    .eq("id", student.training_path_id)
    .maybeSingle();
  trainingPlanName = pathMeta?.name ?? null;

  const versionContext = await buildVersionContextForUserTraining(
    supabase,
    userId,
    student
  );

  const lessonsOrdered = await fetchLessonsForTrainingPath(
    supabase,
    student.training_path_id,
    versionContext
  );
  const lessonCount = lessonsOrdered.length;

  const { currentWeek, totalWeeks } = computeProgramLessonWeek({
    startDateIso: student.start_date,
    lessonCount,
    explicitWeek:
      typeof week === "number" && Number.isFinite(week) && week >= 1
        ? Math.floor(week)
        : undefined,
  });

  let weekContent = null;

  const weekLessonRow =
    lessonCount > 0 && currentWeek > 0
      ? (lessonsOrdered[currentWeek - 1] as Record<string, unknown>)
      : null;

  if (weekLessonRow && typeof weekLessonRow === "object") {
    const weekData = weekLessonRow;
    const rawIds = weekData.ata_chapter_ids as unknown;
    if (Array.isArray(rawIds) && rawIds.length) {
      const numIds = rawIds.filter((x: unknown): x is number => typeof x === "number");
      if (numIds.length) {
        const { data: chRows } = await supabase
          .from("ata_chapter")
          .select("id, chapter_number, title")
          .in("id", numIds);
        const byId = new Map(
          (chRows ?? []).map((r) => [
            r.id as number,
            r as { chapter_number: string; title: string },
          ])
        );
        const lines = numIds
          .map((id) => byId.get(id))
          .filter((r): r is { chapter_number: string; title: string } => r != null)
          .map((c) => `${c.chapter_number} — ${c.title}`);
        weekContent = { ...weekData, ata_chapter_display: lines.join(" · ") };
      } else {
        weekContent = weekData;
      }
    } else {
      weekContent = weekData;
    }
  }

  // Calculate due date (end slot for this lesson week)
  const dueDate = new Date(startDate);
  if (currentWeek > 0) {
    dueDate.setDate(startDate.getDate() + currentWeek * 7 - 1);
  }

  return {
    student,
    currentWeek,
    totalWeeks,
    dueDate,
    weekContent,
    trainingPlanName,
  };
}

interface PageProps {
  searchParams: Promise<{
    week?: string;
    question?: string;
  }>;
}

export default async function TrainingPage({ searchParams }: PageProps) {
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
  const data = await getStudentTrainingData(user.id, week);
  const updatesResult = await getCourseVersionUpdatesForCurrentEnrollment();
  const versionUpdates = updatesResult.ok ? updatesResult.updates : [];

  if (!data) {
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Training</h1>
        <p className="text-muted-foreground text-base">
          No active training selected. Use{" "}
          <Link href="/dashboard/student/find-training" className="text-primary underline underline-offset-4">
            Find Training
          </Link>{" "}
          to choose a program.
        </p>
      </div>
    );
  }

  const lessonId = await resolveLessonIdForProgramWeek(
    supabase,
    data.student,
    data.currentWeek,
    await buildVersionContextForUserTraining(supabase, user.id, data.student)
  );

  const { data: submission } = lessonId
    ? await supabase
        .from("lesson_submissions")
        .select(
          `
      *,
      lesson_submission_files (*)
    `
        )
        .eq("user_training_id", data.student.id)
        .eq("lesson_id", lessonId)
        .maybeSingle()
    : { data: null };

  let submissionVersionLabel: string | null = null;
  if (submission?.course_version_id) {
    const { data: versionRow } = await supabase
      .from("course_versions")
      .select("major_version, minor_version")
      .eq("id", submission.course_version_id)
      .maybeSingle();
    if (versionRow) {
      submissionVersionLabel = formatCourseVersion(
        versionRow.major_version as number,
        versionRow.minor_version as number
      );
    }
  }

  let lessonProgressSnapshot: TalentLessonProgressSnapshot | null = null;

  if (lessonId && user.email) {
    const { data: lessonTalentRow } = await supabase
      .from("lessons")
      .select("talent_lms_unit_id")
      .eq("id", lessonId)
      .maybeSingle();

    const hasTalentUnit = coerceTalentLmsUnitId(
      typeof lessonTalentRow?.talent_lms_unit_id === "string"
        ? lessonTalentRow.talent_lms_unit_id
        : null
    );

    if (hasTalentUnit) {
      const { data: profileRow } = await supabase
        .from("users")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();

      lessonProgressSnapshot = await fetchTalentLessonProgressSnapshot(supabase, {
        userEmail: user.email,
        additionalEmails: [
          typeof profileRow?.email === "string" ? profileRow.email : undefined,
        ],
        lessonId,
      });
    }
  }

  const discussion = lessonId
    ? await getLessonDiscussion(data.student.id, lessonId)
    : null;
  const openQuestionIndex =
    params.question != null && /^\d+$/.test(params.question)
      ? parseInt(params.question, 10)
      : null;

  const prevWeek = data.currentWeek > 1 ? data.currentWeek - 1 : null;
  const nextWeek = data.currentWeek < data.totalWeeks ? data.currentWeek + 1 : null;

  // Get week content from database or use defaults
  const weekContent = data.weekContent || {
    title: "Training Content",
    ata_chapter: "12",
    learning_objectives: [],
    study_materials: "Content not yet available for this week.",
    practical_application: "Follow your mentor's guidance for practical application.",
    mentor_discussion_questions: [],
    weekly_deliverable: "Complete assigned tasks and document your work.",
  };

  /** Lesson row merged with defaults above is always string-shaped for rendering. */
  const w = weekContent as {
    title?: string;
    ata_chapter?: string;
    learning_objectives?: string[];
    study_materials?: string;
    practical_application?: string;
    mentor_discussion_questions?: string[];
    weekly_deliverable?: string;
  };

  const ataDisplay = (weekContent as { ata_chapter_display?: string })
    .ata_chapter_display;
  const ataChapterLine =
    typeof ataDisplay === "string" && ataDisplay.length > 0
      ? ataDisplay
      : w.ata_chapter
        ? `ATA Chapter ${w.ata_chapter}`
        : "Training Content";

  const learningObjectives = w.learning_objectives || [];
  const mentorQuestions = w.mentor_discussion_questions || [];

  const pageTitle = data.trainingPlanName ?? "Training";
  const sectionTitleClass =
    "text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground";

  return (
    <DashboardPageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-base text-muted-foreground">Your weekly learning materials</p>
        </div>
        <Button asChild className="shrink-0 bg-primary text-primary-foreground">
          <Link href={`/dashboard/student/training/submit?week=${data.currentWeek}`}>
            <FileText className="mr-2 h-4 w-4" />
            Submit Week
          </Link>
        </Button>
      </div>

      <DashboardContentFrame className="px-5 py-7 sm:px-8 sm:py-9">
        <CourseVersionUpdateBanner updates={versionUpdates} />

        {/* Week navigation */}
        <nav
          aria-label="Week navigation"
          className="mb-8 flex items-center justify-between"
        >
          {prevWeek ? (
            <Link
              href={`/dashboard/student/training?week=${prevWeek}`}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </Link>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground/40">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Previous</span>
            </span>
          )}

          <p className="text-sm font-semibold tabular-nums text-foreground">
            Week {data.currentWeek}
            <span className="font-normal text-muted-foreground"> of {data.totalWeeks}</span>
          </p>

          {nextWeek ? (
            <Link
              href={`/dashboard/student/training?week=${nextWeek}`}
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="hidden sm:inline">Next</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground/40">
              <span className="hidden sm:inline">Next</span>
              <ArrowRight className="h-4 w-4" />
            </span>
          )}
        </nav>

        {/* Lesson hero */}
        <header className="mb-12">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Week {data.currentWeek} of {data.totalWeeks}
              <span className="mx-2 text-muted-foreground/40">·</span>
              {ataChapterLine}
            </p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-[1.75rem]">
              {w.title ?? "Training Content"}
            </h2>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Due {formatUiDate(data.dueDate)}
            </p>
          </div>
        </header>

        {/* Content sections — generous vertical rhythm, no dividers */}
        <div className="space-y-12">
          <CollapsibleSection
            variant="section"
            title="Learning Objectives"
            icon={<Target className="h-4 w-4" />}
            titleClassName={sectionTitleClass}
            headerHoverHighlight={false}
            defaultOpen={true}
          >
          {learningObjectives.length > 0 ? (
            <ul className="space-y-3">
              {learningObjectives.map((objective: string, index: number) => (
                <li key={index} className="flex items-start gap-3">
                  <span className="text-green-600 mt-0.5">✓</span>
                  <span className="text-sm">{objective}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No learning objectives defined for this week.</p>
          )}
        </CollapsibleSection>

          <CollapsibleSection
            variant="section"
            title="Study Materials"
            icon={<BookOpen className="h-4 w-4" />}
            titleClassName={sectionTitleClass}
            headerHoverHighlight={false}
            defaultOpen={true}
          >
            <LessonMarkdownBody markdown={w.study_materials ?? ""} />
          </CollapsibleSection>

          {lessonProgressSnapshot ? (
            <CollapsibleSection
              variant="section"
              title="Lesson Progress"
              icon={<Percent className="h-4 w-4" />}
              titleClassName={sectionTitleClass}
              headerHoverHighlight={false}
              defaultOpen={true}
            >
              <LessonProgressCard
                weekNumber={data.currentWeek}
                initialSnapshot={lessonProgressSnapshot}
              />
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection
            variant="section"
            title="Practical Application"
            icon={<Clock className="h-4 w-4" />}
            titleClassName={sectionTitleClass}
            headerHoverHighlight={false}
            defaultOpen={true}
          >
            <LessonMarkdownBody markdown={w.practical_application ?? ""} />
          </CollapsibleSection>

          <CollapsibleSection
            variant="section"
            title="Questions for Mentor Discussion"
            icon={<MessageSquare className="h-4 w-4" />}
            titleClassName={sectionTitleClass}
            headerHoverHighlight={false}
            defaultOpen={true}
          >
          {lessonId ? (
            <LessonDiscussion
              userTrainingId={data.student.id}
              lessonId={lessonId}
              questions={mentorQuestions}
              programWeek={data.currentWeek}
              initial={discussion}
              openQuestionIndex={openQuestionIndex}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No discussion questions defined for this week.</p>
          )}
          </CollapsibleSection>

          <CollapsibleSection
            variant="section"
            title="Weekly Deliverable"
            icon={<FileText className="h-4 w-4" />}
            titleClassName={sectionTitleClass}
            headerHoverHighlight={false}
            defaultOpen={true}
          >
            <LessonMarkdownBody markdown={w.weekly_deliverable ?? ""} />
          </CollapsibleSection>

          <CollapsibleSection
            variant="section"
            title="My Submission"
            icon={<FileText className="h-4 w-4" />}
            titleClassName={sectionTitleClass}
            headerHoverHighlight={false}
            defaultOpen={true}
          >
          {submission ? (
            <div className="space-y-6">
              <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-[minmax(0,9rem)_1fr]">
                <dt className="text-sm font-medium text-muted-foreground">Reflection</dt>
                <dd className="text-sm text-foreground whitespace-pre-wrap">
                  {submission.reflection_text || "No reflection provided."}
                </dd>
                {submissionVersionLabel ? (
                  <>
                    <dt className="text-sm font-medium text-muted-foreground">Course version</dt>
                    <dd className="text-sm text-foreground tabular-nums">
                      v{submissionVersionLabel}
                    </dd>
                  </>
                ) : null}
              </dl>

              {submission.talent_lms_unit_completed === true &&
                submission.talent_lms_completion_checked_at && (
                  <div className="flex items-start gap-2 rounded-md bg-muted/25 px-3 py-2 text-sm ring-1 ring-black/[0.04]">
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    <div>
                      <p className="font-medium">Talent LMS lesson verified</p>
                      <p className="text-xs opacity-90">
                        Checked{" "}
                        {formatUiDateTime(
                          submission.talent_lms_completion_checked_at as string
                        )}
                      </p>
                    </div>
                  </div>
                )}

              {submission.talent_lms_unit_completed == null &&
                (() => {
                  const meta = submission.talent_lms_completion_meta as Record<
                    string,
                    unknown
                  > | null;
                  const reason =
                    meta && typeof meta.skip_reason === "string"
                      ? meta.skip_reason
                      : null;
                  if (reason === "unit_not_in_link") {
                    return (
                      <p className="rounded-md bg-muted/25 px-3 py-2 text-xs text-muted-foreground ring-1 ring-black/[0.04]">
                        Talent completion was not checked because the lesson link does not
                        include a unit id (expected in URLs like{" "}
                        <span className="font-mono text-[11px]">
                          …/plus/my/training/COURSE/units/UNIT
                        </span>{" "}
                        or{" "}
                        <span className="font-mono text-[11px]">
                          …/course/play/id:COURSE/unit:UNIT
                        </span>
                        ). Your reflection was still saved.
                      </p>
                    );
                  }
                  if (reason === "could_not_resolve_course_id") {
                    return (
                      <p className="rounded-md bg-muted/25 px-3 py-2 text-xs text-muted-foreground ring-1 ring-black/[0.04]">
                        Talent completion was not checked because neither the lesson URL nor
                        your training path specifies a Talent course id.
                      </p>
                    );
                  }
                  return null;
                })()}

              {submission.lesson_submission_files &&
               submission.lesson_submission_files.length > 0 && (
                <dl className="space-y-3">
                  <dt className="text-sm font-medium text-muted-foreground">Attached files</dt>
                  <dd>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {submission.lesson_submission_files.map(
                        (file: {
                          id: string;
                          file_url: string;
                          file_name: string;
                          file_type?: string | null;
                        }) => (
                        <a
                          key={file.id}
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group block overflow-hidden rounded-md transition-opacity hover:opacity-90"
                        >
                          {file.file_type?.startsWith("image/") ? (
                            <div className="aspect-square">
                              <img
                                src={file.file_url}
                                alt={file.file_name}
                                className="h-full w-full object-cover transition-opacity group-hover:opacity-90"
                              />
                            </div>
                          ) : (
                            <div className="flex aspect-square flex-col items-center justify-center bg-muted/30 p-4 transition-colors group-hover:bg-muted/50">
                              <FileText className="mb-2 h-7 w-7 text-muted-foreground" />
                              <p className="w-full truncate text-center text-xs text-muted-foreground">
                                {file.file_name}
                              </p>
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </dd>
                </dl>
              )}

              <div>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/student/training/submit?week=${data.currentWeek}`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Submission
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You have not submitted a reflection for this week yet.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link href={`/dashboard/student/training/submit?week=${data.currentWeek}`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Submit Reflection
                </Link>
              </Button>
            </div>
          )}
          </CollapsibleSection>
        </div>
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}
