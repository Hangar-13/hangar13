import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/apprentice/progress-bar";
import { CurrentTrainingCard } from "@/components/apprentice/current-training-card";
import { HoursProgressCard } from "@/components/apprentice/hours-progress-card";
import { MetricCards } from "@/components/apprentice/metric-cards";
import { RecentActivityCard } from "@/components/apprentice/recent-activity-card";
import { FileText } from "lucide-react";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import {
  getCertificationAwardsForUser,
  getTrainingCompletionsForUser,
} from "@/app/actions/user-credentials";
import { CredentialsSummaryCard } from "@/components/apprentice/credentials-summary-card";

async function getUserProfile(userId: string) {
  const supabase = await createServerSupabaseClient();
  
  const { data: profile, error } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error || !profile) {
    return null;
  }

  return profile;
}

async function getApprenticeData(userId: string) {
  const supabase = await createServerSupabaseClient();

  const { userTraining: apprentice } = await getCurrentUserTrainingContext(supabase, userId);

  if (!apprentice) {
    return null;
  }

  // Get curriculum items
  const { data: curriculumItems, error: curriculumError } = await supabase
    .from("curriculum_items")
    .select("*")
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  // Get progress for this apprentice
  const { data: progressData } = await supabase
    .from("apprentice_progress")
    .select("*")
    .eq("user_training_id", apprentice.id);

  // Create a map of curriculum item ID to progress
  const progressMap = new Map(
    progressData?.map((p) => [p.curriculum_item_id, p]) || []
  );

  // Transform curriculum items to include progress status
  const itemsWithProgress =
    curriculumItems?.map((item: any) => {
      const progress = progressMap.get(item.id);
      return {
        ...item,
        status: progress?.status || "not_started",
        hours_spent: progress?.hours_spent || 0,
      };
    }) || [];

  // Get all logbook entries for hours calculations
  const { data: allLogbookEntries } = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("user_training_id", apprentice.id);

  // Get recent logbook entries (for recent activity)
  const { data: recentLogbookEntries } = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("user_training_id", apprentice.id)
    .order("entry_date", { ascending: false })
    .limit(5);

  // Calculate total hours
  const totalHours = allLogbookEntries?.reduce(
    (sum, entry) => sum + Number(entry.hours_worked || 0),
    0
  ) || 0;

  // Calculate this week's hours
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const thisWeekHours = allLogbookEntries?.filter((entry) => {
    const entryDate = new Date(entry.entry_date);
    return entryDate >= startOfWeek;
  }).reduce((sum, entry) => sum + Number(entry.hours_worked || 0), 0) || 0;

  // Calculate current week (weeks since start date)
  const startDate = new Date(apprentice.start_date);
  const daysSinceStart = Math.floor(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
  const totalWeeks = 130; // Program duration

  // Find current training topic (first incomplete item)
  const currentTrainingItem = itemsWithProgress.find(
    (item) => item.status !== "completed" && item.status !== "reviewed"
  );

  // Calculate due date (end of current week)
  const dueDate = new Date(startDate);
  dueDate.setDate(startDate.getDate() + currentWeek * 7 - 1);

  // Calculate progress
  const totalItems = itemsWithProgress.length;
  const completedItems = itemsWithProgress.filter(
    (item) => item.status === "completed" || item.status === "reviewed"
  ).length;

  // ATA Chapters (using curriculum items as proxy, grouped by category)
  const uniqueCategories = new Set(
    itemsWithProgress
      .map((item) => item.category)
      .filter((cat): cat is string => !!cat)
  );
  const completedCategories = new Set(
    itemsWithProgress
      .filter((item) => item.status === "completed" || item.status === "reviewed")
      .map((item) => item.category)
      .filter((cat): cat is string => !!cat)
  );

  let trainingPlanName: string | null = null;
  if (apprentice.training_plan_id) {
    const { data: plan } = await supabase
      .from("training_plans")
      .select("name")
      .eq("id", apprentice.training_plan_id)
      .maybeSingle();
    trainingPlanName = plan?.name ?? null;
  }

  return {
    apprentice,
    trainingPlanName,
    curriculumItems: itemsWithProgress,
    logbookEntries: recentLogbookEntries || [],
    progress: {
      completed: completedItems,
      total: totalItems,
    },
    hours: {
      total: totalHours,
      thisWeek: thisWeekHours,
      target: 5200,
    },
    weeks: {
      current: currentWeek,
      total: totalWeeks,
    },
    currentTraining: {
      topic: currentTrainingItem?.title || "Safety, Ground Operations & Servicing",
      dueDate,
    },
    ataChapters: {
      completed: completedCategories.size,
      total: uniqueCategories.size || 43,
    },
  };
}

export default async function ApprenticeDashboard() {
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
    getApprenticeData(user.id),
    getTrainingCompletionsForUser(user.id),
    getCertificationAwardsForUser(user.id),
  ]);

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-muted-foreground text-base">
            No active training enrollment. Use{" "}
            <Link href="/dashboard/apprentice/find-training" className="text-primary underline underline-offset-4">
              Find Training
            </Link>{" "}
            to enroll, or{" "}
            <Link href="/dashboard/apprentice/credentials" className="text-primary underline underline-offset-4">
              My Training Programs
            </Link>{" "}
            to set your current program.
          </p>
        </div>
        <CredentialsSummaryCard
          trainingCount={trainings.length}
          certificationCount={certifications.length}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-muted-foreground text-base">
            Keep up the great work on your aviation journey
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/dashboard/apprentice/logbook?add=true">+ Log Entry</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/dashboard/apprentice/training/submit?week=${data.weeks.current}`}>
              <FileText className="mr-2 h-4 w-4" />
              Submit Week
            </Link>
          </Button>
        </div>
      </div>

      <div className="space-y-2 -mt-4">
        <ProgressBar
          completed={data.progress.completed}
          total={data.progress.total}
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
