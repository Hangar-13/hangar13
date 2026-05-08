import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { PendingLogbookEntries, type PendingLogbookEntry } from "@/components/mentor/pending-logbook-entries";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import {
  fetchActiveEnrollmentIdsForMentor,
  fetchTraineeUserIdsForMentor,
} from "@/lib/mentor-enrollments";

async function getMentorData(userId: string) {
  const supabase = await createServerSupabaseClient();

  const [traineeUserIds, enrollmentIds] = await Promise.all([
    fetchTraineeUserIdsForMentor(supabase, userId),
    fetchActiveEnrollmentIdsForMentor(supabase, userId),
  ]);

  const enrollmentByTraineeUserId = new Map<string, string>();
  if (enrollmentIds.length > 0) {
    const { data: utRows } = await supabase
      .from("user_trainings")
      .select("id, user_id")
      .in("id", enrollmentIds);
    for (const r of utRows ?? []) {
      if (!enrollmentByTraineeUserId.has(r.user_id)) {
        enrollmentByTraineeUserId.set(r.user_id, r.id);
      }
    }
  }

  async function attachEntryContext(
    entry: Record<string, unknown> & { user_id: string }
  ): Promise<PendingLogbookEntry> {
    let utId = enrollmentByTraineeUserId.get(entry.user_id) ?? null;
    if (!utId) {
      const { data: ut } = await supabase
        .from("user_trainings")
        .select("id")
        .eq("user_id", entry.user_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      utId = ut?.id ?? null;
    }
    const { data: profile } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("id", entry.user_id)
      .single();

    return {
      ...entry,
      user_trainings: {
        id: utId ?? "",
        user_id: entry.user_id,
        users: profile,
      },
    } as unknown as PendingLogbookEntry;
  }

  if (traineeUserIds.length === 0) {
    return { pendingEntries: [], allEntries: [] };
  }

  const { data: entries } = await supabase
    .from("logbook_entries")
    .select("*")
    .in("user_id", traineeUserIds)
    .order("entry_date", { ascending: false });

  const allEntries = await Promise.all((entries ?? []).map(attachEntryContext));
  const pendingEntries = allEntries.filter((e) => e.status === "submitted");

  return {
    pendingEntries,
    allEntries,
  };
}

interface PageProps {
  searchParams: Promise<{
    student?: string;
    openLog?: string;
  }>;
}

export default async function ReviewLogsPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const params = await searchParams;
  const studentName = params.student || "";
  const openLogId = params.openLog || "";

  const [data, ataChapters] = await Promise.all([
    getMentorData(user.id),
    getAtaChapters(),
  ]);

  const acsCodesByEntry =
    data.allEntries?.length > 0
      ? await getAcsCodesByEntry(data.allEntries.map((e: { id: string }) => e.id))
      : {};

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Review Logbook Entries</h1>
        <p className="text-muted-foreground text-base">
          Review and approve logbook entries from your mentees.
        </p>
      </div>

      <PendingLogbookEntries
        entries={data.allEntries}
        acsCodesByEntry={acsCodesByEntry}
        ataChapters={ataChapters.map((c: { chapter_number: string; title: string }) => ({
          value: c.chapter_number,
          label: `${c.chapter_number} - ${c.title}`,
        }))}
        initialNameFilter={studentName}
        initialOpenEntryId={openLogId}
      />
    </div>
  );
}
