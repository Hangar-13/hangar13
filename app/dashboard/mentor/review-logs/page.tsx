import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { PendingLogbookEntries } from "@/components/mentor/pending-logbook-entries";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getAtaChapters } from "@/app/actions/ata-chapters";

async function getMentorData(userId: string) {
  const supabase = await createServerSupabaseClient();

  // Get assigned apprentices
  const { data: apprentices } = await supabase
    .from("apprentices")
    .select("id")
    .eq("mentor_id", userId)
    .eq("status", "active");

  const apprenticeIds = apprentices?.map((a) => a.id) || [];

  let pendingEntries: any[] = [];
  let allEntries: any[] = [];
  
  if (apprenticeIds.length > 0) {
    // Get all logbook entries from assigned apprentices
    const { data: entries } = await supabase
      .from("logbook_entries")
      .select("*")
      .in("apprentice_id", apprenticeIds)
      .order("entry_date", { ascending: false });

    // Get pending entries
    pendingEntries = (entries || []).filter(e => e.status === "submitted");

    // Get apprentice and profile info for each entry
    allEntries = await Promise.all(
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

    // Get apprentice and profile info for pending entries
    pendingEntries = await Promise.all(
      pendingEntries.map(async (entry) => {
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
    pendingEntries,
    allEntries,
  };
}

interface PageProps {
  searchParams: Promise<{
    apprentice?: string;
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
  const apprenticeName = params.apprentice || "";
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
        initialNameFilter={apprenticeName}
        initialOpenEntryId={openLogId}
      />
    </div>
  );
}
