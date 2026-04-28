import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { PendingLogbookEntries } from "@/components/mentor/pending-logbook-entries";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getAtaChapters } from "@/app/actions/ata-chapters";

async function getMentorData(userId: string) {
  const supabase = await createServerSupabaseClient();

  // Get assigned students
  const { data: students } = await supabase
    .from("user_trainings")
    .select("id")
    .eq("mentor_id", userId)
    .eq("status", "active");

  const studentIds = students?.map((a) => a.id) || [];

  let pendingEntries: any[] = [];
  let allEntries: any[] = [];
  
  if (studentIds.length > 0) {
    // Get all logbook entries from assigned students
    const { data: entries } = await supabase
      .from("logbook_entries")
      .select("*")
      .in("user_training_id", studentIds)
      .order("entry_date", { ascending: false });

    // Get pending entries
    pendingEntries = (entries || []).filter(e => e.status === "submitted");

    // Get student and profile info for each entry
    allEntries = await Promise.all(
      (entries || []).map(async (entry) => {
        const { data: student } = await supabase
          .from("user_trainings")
          .select("id, user_id")
          .eq("id", entry.user_training_id)
          .single();

        let profile = null;
        if (student?.user_id) {
          const { data: profileData } = await supabase
            .from("users")
            .select("id, full_name, email")
            .eq("id", student.user_id)
            .single();
          profile = profileData;
        }

        return {
          ...entry,
          user_trainings: student
            ? {
                ...student,
                users: profile,
              }
            : null,
        };
      })
    );

    // Get student and profile info for pending entries
    pendingEntries = await Promise.all(
      pendingEntries.map(async (entry) => {
        const { data: student } = await supabase
          .from("user_trainings")
          .select("id, user_id")
          .eq("id", entry.user_training_id)
          .single();

        let profile = null;
        if (student?.user_id) {
          const { data: profileData } = await supabase
            .from("users")
            .select("id, full_name, email")
            .eq("id", student.user_id)
            .single();
          profile = profileData;
        }

        return {
          ...entry,
          user_trainings: student
            ? {
                ...student,
                users: profile,
              }
            : null,
        };
      })
    );
  }

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
