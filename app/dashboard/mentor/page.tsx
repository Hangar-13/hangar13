import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { AssignedApprenticesList } from "@/components/mentor/assigned-apprentices-list";
import { PendingLogbookEntries } from "@/components/mentor/pending-logbook-entries";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getAtaChapters } from "@/app/actions/ata-chapters";

async function getMentorData(userId: string) {
  const supabase = await createServerSupabaseClient();

  // Get assigned apprentices
  const { data: apprentices, error: apprenticesError } = await supabase
    .from("apprentices")
    .select("*")
    .eq("mentor_id", userId)
    .eq("status", "active");

  const now = new Date();
  const targetHours = 5200;

  // Get profiles and progress data for apprentices (for compact dashboard cards)
  const apprenticesWithProfiles = await Promise.all(
    (apprentices || []).map(async (apprentice) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, email, full_name, avatar_url")
        .eq("id", apprentice.user_id)
        .single();

      const { data: logbookEntries } = await supabase
        .from("logbook_entries")
        .select("*")
        .eq("apprentice_id", apprentice.id);

      const totalHours = logbookEntries?.reduce(
        (sum: number, entry: { hours_worked?: number }) => sum + Number(entry.hours_worked || 0),
        0
      ) || 0;

      const pendingEntries = logbookEntries?.filter(
        (e: { status: string }) => e.status === "submitted"
      ).length || 0;

      const startDate = new Date(apprentice.start_date);
      const daysSinceStart = Math.floor(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

      const expectedHoursPerWeek = 40;
      const expectedHours = currentWeek * expectedHoursPerWeek;
      const hoursProgress = (totalHours / targetHours) * 100;
      const expectedProgress = (expectedHours / targetHours) * 100;
      let progressStatus: "on_track" | "behind_pace" | "ahead" = "on_track";
      if (hoursProgress < expectedProgress - 10) progressStatus = "behind_pace";
      else if (hoursProgress > expectedProgress + 10) progressStatus = "ahead";

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
        progressData?.map((p: { curriculum_item_id: string }) => [p.curriculum_item_id, p]) || []
      );

      const itemsWithProgress =
        curriculumItems?.map((item: { id: string }) => {
          const progress = progressMap.get(item.id);
          return { ...item, status: (progress as { status?: string })?.status || "not_started" };
        }) || [];

      const completedItems = itemsWithProgress.filter(
        (item: { status: string }) => item.status === "completed" || item.status === "reviewed"
      ).length;

      const totalItems = itemsWithProgress.length;
      const overallProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

      return {
        ...apprentice,
        profiles: profile,
        progress: { overall: overallProgress, completed: completedItems, total: totalItems },
        hours: { total: totalHours, target: targetHours, progress: Math.round(hoursProgress) },
        weeks: { current: currentWeek },
        progressStatus,
        pendingEntries,
      };
    })
  );

  // Get pending logbook entries from assigned apprentices
  const apprenticeIds = apprentices?.map((a) => a.id) || [];

  let pendingEntries: any[] = [];
  if (apprenticeIds.length > 0) {
    const { data: entries, error: entriesError } = await supabase
      .from("logbook_entries")
      .select("*")
      .in("apprentice_id", apprenticeIds)
      .eq("status", "submitted")
      .order("entry_date", { ascending: false });

    // Get apprentice and profile info for each entry
    pendingEntries = await Promise.all(
      (entries || []).map(async (entry) => {
        const { data: apprentice } = await supabase
          .from("apprentices")
          .select("id, user_id")
          .eq("id", entry.apprentice_id)
          .single();

        let profile = null;
        if (apprentice?.user_id) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("id, full_name, email")
            .eq("id", apprentice.user_id)
            .single();
          profile = profileData;
        }

        return {
          ...entry,
          apprentices: apprentice
            ? {
                ...apprentice,
                profiles: profile,
              }
            : null,
        };
      })
    );
  }

  return {
    apprentices: apprenticesWithProfiles,
    pendingEntries,
  };
}

export default async function MentorDashboard() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [data, ataChapters] = await Promise.all([
    getMentorData(user.id),
    getAtaChapters(),
  ]);

  const acsCodesByEntry =
    data.pendingEntries?.length > 0
      ? await getAcsCodesByEntry(data.pendingEntries.map((e: { id: string }) => e.id))
      : {};

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Mentor Dashboard</h1>
        <p className="text-muted-foreground text-base">
          Manage your apprentices and review their logbook entries.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AssignedApprenticesList apprentices={data.apprentices} compact />
        <PendingLogbookEntries
          entries={data.pendingEntries}
          acsCodesByEntry={acsCodesByEntry}
          ataChapters={ataChapters.map((c: { chapter_number: string; title: string }) => ({
            value: c.chapter_number,
            label: `${c.chapter_number} - ${c.title}`,
          }))}
        />
      </div>
    </div>
  );
}
