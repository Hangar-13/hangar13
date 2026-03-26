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
  Edit
} from "lucide-react";
import { CollapsibleSection } from "@/components/apprentice/collapsible-section";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { redirectIfNoUserTrainings } from "@/lib/apprentice-user-trainings-guard";

async function getApprenticeTrainingData(userId: string, week: number = 1) {
  const supabase = await createServerSupabaseClient();

  const { userTraining: apprentice } = await getCurrentUserTrainingContext(supabase, userId);

  if (!apprentice) {
    return null;
  }

  // Calculate current week based on start date if week is not provided
  const now = new Date();
  const startDate = new Date(apprentice.start_date);
  const daysSinceStart = Math.floor(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const currentWeek = week || Math.max(1, Math.floor(daysSinceStart / 7) + 1);

  // Get training plan info if training_plan_id exists and table exists
  let totalWeeks = 130;
  let weekContent = null;
  let trainingPlanName: string | null = null;

  if (apprentice.training_plan_id) {
    // Try to get training plan (table might not exist yet)
    const { data: trainingPlan } = await supabase
      .from("training_plans")
      .select("total_weeks, name")
      .eq("id", apprentice.training_plan_id)
      .maybeSingle();
    
    if (trainingPlan) {
      totalWeeks = trainingPlan.total_weeks || 130;
      trainingPlanName = trainingPlan.name ?? null;
    }

    // Try to get week content (table might not exist yet)
    const { data: weekData } = await supabase
      .from("training_plan_weeks")
      .select("*")
      .eq("training_plan_id", apprentice.training_plan_id)
      .eq("week_number", currentWeek)
      .maybeSingle();
    
    weekContent = weekData || null;
  }

  // Calculate due date (end of current week)
  const dueDate = new Date(startDate);
  dueDate.setDate(startDate.getDate() + currentWeek * 7 - 1);

  return {
    apprentice,
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
  const data = await getApprenticeTrainingData(user.id, week);

  if (!data) {
    return (
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Training</h1>
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

  // Get current week's submission if it exists
  const { data: submission } = await supabase
    .from("weekly_submissions")
    .select(
      `
      *,
      weekly_submission_files (*)
    `
    )
    .eq("user_training_id", data.apprentice.id)
    .eq("week_number", data.currentWeek)
    .maybeSingle();

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  };

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

  const learningObjectives = weekContent.learning_objectives || [];
  const mentorQuestions = weekContent.mentor_discussion_questions || [];

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
          <Link href={`/dashboard/apprentice/training/submit?week=${data.currentWeek}`}>
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
                href={`/dashboard/apprentice/training?week=${prevWeek}`}
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
                href={`/dashboard/apprentice/training?week=${nextWeek}`}
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
            <BookOpen className="h-6 w-6 mt-1" />
            <div className="flex-1 space-y-2">
              <p className="text-sm text-primary-foreground/80">
                {weekContent.ata_chapter ? `ATA Chapter ${weekContent.ata_chapter}` : "Training Content"}
              </p>
              <h2 className="text-2xl font-bold">
                {weekContent.title}
              </h2>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4" />
                <span>Due: {formatDate(data.dueDate)}</span>
              </div>
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
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {weekContent.study_materials}
          </p>
        </CollapsibleSection>

        <CollapsibleSection
          title="Practical Application"
          icon={<Clock className="h-5 w-5" />}
          defaultOpen={true}
        >
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {weekContent.practical_application}
          </p>
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
          <p className="text-sm text-muted-foreground mb-4 whitespace-pre-wrap">
            {weekContent.weekly_deliverable}
          </p>
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

              {submission.weekly_submission_files && 
               submission.weekly_submission_files.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">Attached Files</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {submission.weekly_submission_files.map((file: any) => (
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
                  <Link href={`/dashboard/apprentice/training/submit?week=${data.currentWeek}`}>
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
                <Link href={`/dashboard/apprentice/training/submit?week=${data.currentWeek}`}>
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
