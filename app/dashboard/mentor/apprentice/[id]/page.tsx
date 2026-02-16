import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect, notFound } from "next/navigation";
import { ApprenticeEntriesList } from "@/components/mentor/apprentice-entries-list";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { Card, CardContent } from "@/components/ui/card";
import { User, Mail, Calendar, ArrowLeft, Clock, Target, CheckCircle, AlertCircle, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

async function getApprenticeData(apprenticeId: string, mentorId: string) {
  const supabase = await createServerSupabaseClient();

  // Get apprentice record and verify mentor relationship
  const { data: apprentice, error: apprenticeError } = await supabase
    .from("apprentices")
    .select("*")
    .eq("id", apprenticeId)
    .single();

  if (apprenticeError || !apprentice) {
    return null;
  }

  // Verify the mentor has permission to view this apprentice
  if (apprentice.mentor_id !== mentorId) {
    return { unauthorized: true };
  }

  // Get apprentice profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, full_name, avatar_url")
    .eq("id", apprentice.user_id)
    .single();

  // Get all logbook entries for this apprentice
  const { data: entries, error: entriesError } = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("apprentice_id", apprenticeId)
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
  const startDate = new Date(apprentice.start_date);
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

  // Get curriculum items and progress for overall progress
  const { data: curriculumItems } = await supabase
    .from("curriculum_items")
    .select("*")
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  const { data: progressData } = await supabase
    .from("apprentice_progress")
    .select("*")
    .eq("apprentice_id", apprentice.id);

  const progressMap = new Map(
    progressData?.map((p) => [p.curriculum_item_id, p]) || []
  );

  const itemsWithProgress =
    curriculumItems?.map((item: any) => {
      const progress = progressMap.get(item.id);
      return {
        ...item,
        status: progress?.status || "not_started",
      };
    }) || [];

  const completedItems = itemsWithProgress.filter(
    (item) => item.status === "completed" || item.status === "reviewed"
  ).length;

  const totalItems = itemsWithProgress.length;
  const overallProgress = totalItems > 0 
    ? Math.round((completedItems / totalItems) * 100) 
    : 0;

  return {
    apprentice: {
      ...apprentice,
      profile,
    },
    entries: entries || [],
    entriesByStatus,
    progress: {
      overall: overallProgress,
      completed: completedItems,
      total: totalItems,
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

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function ApprenticeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const data = await getApprenticeData(id, user.id);

  if (!data) {
    notFound();
  }

  if ((data as any).unauthorized) {
    redirect("/dashboard/mentor");
  }

  const { apprentice, entries, entriesByStatus, progress, hours, weeks, progressStatus, pendingEntries } = data;

  const [ataChapters, acsCodesByEntry] = await Promise.all([
    getAtaChapters(),
    entries && entries.length > 0 ? getAcsCodesByEntry(entries.map((e: { id: string }) => e.id)) : Promise.resolve({}),
  ]);
  const profile = apprentice.profile;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

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
    <div className="space-y-8">
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
                {profile?.full_name || "Apprentice"}
              </h1>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span>{profile?.email}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    <span>Started {formatDate(apprentice.start_date)}</span>
                  </div>
                  {apprentice.end_date && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Ended {formatDate(apprentice.end_date)}</span>
                    </div>
                  )}
                  <span className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                    {apprentice.status}
                  </span>
                </div>
              </div>
            </div>
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name || "Apprentice"}
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

      {/* Progress Stats */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Progress Overview</h2>
          <Link href={`/dashboard/mentor/mentees/progress?apprentice=${apprentice.id}`}>
            <Button variant="outline" size="sm">
              Apprentice Progress
            </Button>
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Overall Progress */}
          <Card className="bg-card/25 border-2 transition-all hover:shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground">Overall Progress</span>
                <span className="font-semibold text-lg">{progress?.overall ?? 0}%</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-3 mb-2">
                <div
                  className="bg-primary rounded-full h-3 transition-all"
                  style={{ width: `${progress?.overall ?? 0}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {progress?.completed ?? 0} of {progress?.total ?? 0} items completed
              </div>
            </CardContent>
          </Card>

          {/* Current Week */}
          <Card className="bg-card/25 border-2 transition-all hover:shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Current Week
                </span>
                <span className="font-semibold text-lg">Week {weeks?.current ?? 0}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Started {formatDate(apprentice.start_date)}
              </div>
            </CardContent>
          </Card>

          {/* Hours Progress */}
          <Card className="bg-card/25 border-2 transition-all hover:shadow-md">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Hours Progress
                </span>
                <span className="font-semibold text-lg">
                  {(hours?.total ?? 0).toFixed(1)} / {hours?.target ?? 0}
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-3 mb-2">
                <div
                  className="bg-primary rounded-full h-3 transition-all"
                  style={{ width: `${Math.min(hours?.progress ?? 0, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <div className="text-xs text-muted-foreground">
                  {hours?.progress ?? 0}% complete
                </div>
                {getStatusBadge(progressStatus)}
              </div>
            </CardContent>
          </Card>

          {/* Pending Entries */}
          <Card className="bg-card/25 border-2 transition-all hover:shadow-md hover:border-primary/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  Pending Entries
                </span>
                <span className={`font-semibold text-3xl ${(pendingEntries ?? 0) > 0 ? "text-primary" : ""}`}>
                  {pendingEntries ?? 0}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                Awaiting approval
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Entries List */}
      <ApprenticeEntriesList
        entries={entries || []}
        entriesByStatus={entriesByStatus || {
          submitted: [],
          approved: [],
          rejected: [],
          draft: [],
        }}
        acsCodesByEntry={acsCodesByEntry || {}}
        ataChapters={ataChapters.map((c: { chapter_number: string; title: string }) => ({
          value: c.chapter_number,
          label: `${c.chapter_number} - ${c.title}`,
        }))}
      />
    </div>
  );
}

