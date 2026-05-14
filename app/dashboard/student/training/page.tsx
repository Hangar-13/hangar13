import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { 
  BookOpen, 
  Calendar, 
  FileText, 
  ChevronDown, 
  ChevronUp,
  Target,
  Clock,
  MessageSquare,
  ArrowLeft,
  ArrowRight,
  Image as ImageIcon,
  Edit,
  PlayCircle,
} from "lucide-react";
import { CollapsibleSection } from "@/components/student/collapsible-section";
import { LessonMarkdownBody } from "@/components/student/lesson-markdown-body";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { redirectIfNoUserTrainings } from "@/lib/student-user-trainings-guard";
import {
  fetchLessonsForTrainingPath,
  resolveLessonIdForProgramWeek,
} from "@/lib/training-lessons";
import { extractFirstTalentLmsUrlFromMarkdown } from "@/lib/talentlms/lesson-url";
import { computeProgramLessonWeek } from "@/lib/training-program-week";
import { formatUiDate } from "@/lib/format-ui-date";

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
    .select("name")
    .eq("id", student.training_path_id)
    .maybeSingle();
  trainingPlanName = pathMeta?.name ?? null;

  const lessonsOrdered = await fetchLessonsForTrainingPath(
    supabase,
    student.training_path_id
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
    data.currentWeek
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

  const tlSubRaw = process.env.TALENTLMS_SUBDOMAIN?.trim() ?? "";
  const tlSubdomain = tlSubRaw.replace(/\.talentlms\.com$/i, "").trim();
  const talentPortalOrigin =
    tlSubdomain.length > 0 ? `https://${tlSubdomain}.talentlms.com` : null;

  const talentLessonDeepUrl = extractFirstTalentLmsUrlFromMarkdown(
    [w.study_materials, w.practical_application, w.weekly_deliverable]
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .join("\n\n")
  );

  const pageTitle = data.trainingPlanName ?? "Training";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{pageTitle}</h1>
          <p className="text-muted-foreground text-base">Your weekly learning materials</p>
        </div>
        <Button asChild className="bg-primary text-primary-foreground">
          <Link href={`/dashboard/student/training/submit?week=${data.currentWeek}`}>
            <FileText className="mr-2 h-4 w-4" />
            Submit Week
          </Link>
        </Button>
      </div>

      {/* Weekly Navigation */}
      <Card className="bg-card">
        <CardContent className="p-2">
          <div className="flex items-center justify-between">
            {prevWeek ? (
              <Link
                href={`/dashboard/student/training?week=${prevWeek}`}
                className="text-base font-bold text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                <ArrowLeft className="h-5 w-5" />
                Previous
              </Link>
            ) : (
              <span className="text-base font-bold text-muted-foreground/50 flex items-center gap-2">
                <ArrowLeft className="h-5 w-5" />
                Previous
              </span>
            )}
            
            <div className="text-center">
              <p className="text-base text-muted-foreground mb-0">Current Week</p>
              <p className="text-4xl font-bold text-primary">
                Week {data.currentWeek} of {data.totalWeeks}
              </p>
            </div>

            {nextWeek ? (
              <Link
                href={`/dashboard/student/training?week=${nextWeek}`}
                className="text-base font-bold text-muted-foreground hover:text-foreground flex items-center gap-2"
              >
                Next
                <ArrowRight className="h-5 w-5" />
              </Link>
            ) : (
              <span className="text-base font-bold text-muted-foreground/50 flex items-center gap-2">
                Next
                <ArrowRight className="h-5 w-5" />
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Current Chapter Card */}
      <Card className="bg-primary/50 text-primary-foreground border-primary">
        <CardContent className="p-3">
          <div className="flex items-start gap-4">
            <BookOpen className="h-6 w-6 mt-1 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="text-sm text-primary-foreground/80">
                  {ataChapterLine}
                </p>
                <h2 className="text-2xl font-bold">
                  {w.title ?? "Training Content"}
                </h2>
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>Due: {formatUiDate(data.dueDate)}</span>
                </div>
              </div>
              {talentLessonDeepUrl ? (
                <Button
                  asChild
                  variant="secondary"
                  className="shrink-0 gap-2 border border-primary/20 bg-background/80 text-primary hover:bg-background"
                >
                  <a
                    href={talentLessonDeepUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <PlayCircle className="h-5 w-5" />
                    Start lesson
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Sections */}
      <div className="space-y-4">
        <CollapsibleSection
          title="Learning Objectives"
          icon={<Target className="h-5 w-5" />}
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
          title="Study Materials"
          icon={<BookOpen className="h-5 w-5" />}
          defaultOpen={true}
        >
          <LessonMarkdownBody
            markdown={w.study_materials ?? ""}
            talentPortalOrigin={talentPortalOrigin}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Practical Application"
          icon={<Clock className="h-5 w-5" />}
          defaultOpen={true}
        >
          <LessonMarkdownBody
            markdown={w.practical_application ?? ""}
            talentPortalOrigin={talentPortalOrigin}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Questions for Mentor Discussion"
          icon={<MessageSquare className="h-5 w-5" />}
          defaultOpen={true}
        >
          {mentorQuestions.length > 0 ? (
            <ol className="space-y-3 list-decimal list-inside">
              {mentorQuestions.map((question: string, index: number) => (
                <li key={index} className="text-sm text-muted-foreground">
                  {question}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No discussion questions defined for this week.</p>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Weekly Deliverable"
          icon={<FileText className="h-5 w-5" />}
          defaultOpen={true}
        >
          <div className="mb-4">
            <LessonMarkdownBody
              markdown={w.weekly_deliverable ?? ""}
              talentPortalOrigin={talentPortalOrigin}
            />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="My Submission"
          icon={<FileText className="h-5 w-5" />}
          defaultOpen={true}
        >
          {submission ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Your Reflection</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {submission.reflection_text || "No reflection provided."}
                </p>
              </div>

              {submission.lesson_submission_files &&
               submission.lesson_submission_files.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Attached Files</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {submission.lesson_submission_files.map((file: any) => (
                      <div
                        key={file.id}
                        className="relative group rounded-lg overflow-hidden border"
                      >
                        {file.file_type?.startsWith("image/") ? (
                          <a
                            href={file.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block aspect-square"
                          >
                            <img
                              src={file.file_url}
                              alt={file.file_name}
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ) : (
                          <a
                            href={file.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center justify-center aspect-square p-4 bg-muted hover:bg-muted/80 transition-colors"
                          >
                            <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                            <p className="text-xs text-center text-muted-foreground truncate w-full">
                              {file.file_name}
                            </p>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/dashboard/student/training/submit?week=${data.currentWeek}`}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit Submission
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                You haven't submitted a reflection for this week yet.
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
    </div>
  );
}
