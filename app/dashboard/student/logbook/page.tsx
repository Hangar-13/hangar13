import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { LogbookSummaryCards } from "@/components/student/logbook-summary-cards";
import { LogbookTable } from "@/components/student/logbook-table";
import { AddEntryModal } from "@/components/student/add-entry-modal";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import Link from "next/link";

async function getLogbookEntries(userId: string) {
  const supabase = await createServerSupabaseClient();

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, userId);

  if (!student) {
    return null;
  }

  // Logbook entries (optional ACS / metadata on entry)
  const { data: logbookEntries, error: logbookError } = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("user_training_id", student.id)
    .order("entry_date", { ascending: false });

  return logbookEntries || [];
}

interface PageProps {
  searchParams: Promise<{ openLog?: string; add?: string }>;
}

export default async function LogbookPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();
  const params = await searchParams;
  const openLogId = params.openLog || "";
  const openAddModal = params.add === "true";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [entries, ataChapters] = await Promise.all([
    getLogbookEntries(user.id),
    getAtaChapters(),
  ]);

  const acsCodesByEntry = entries
    ? await getAcsCodesByEntry(entries.map((e) => e.id))
    : {};

  if (entries === null) {
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">OJT Logbook</h1>
          <p className="text-muted-foreground text-base">
            No active training selected. Use{" "}
            <Link href="/dashboard/student/find-training" className="text-primary underline underline-offset-4">
              Find Training
            </Link>{" "}
            to choose a program.
          </p>
        </div>
      </div>
    );
  }

  // Calculate summary statistics
  const totalHours = entries.reduce((sum, entry) => sum + (parseFloat(entry.hours_worked?.toString() || "0") || 0), 0);
  const pendingCount = entries.filter((e) => e.status === "submitted").length;
  const signedCount = entries.filter((e) => e.status === "approved").length;
  const totalEntries = entries.length;

  // Entries already have skills_practiced which we're using for ATA chapter

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">OJT Logbook</h1>
          <p className="text-muted-foreground text-base">
            Track your daily work and hours
          </p>
        </div>
        <AddEntryModal
          ataChapters={ataChapters.map((c) => ({
            value: c.chapter_number,
            label: `${c.chapter_number} - ${c.title}`,
          }))}
          defaultOpen={openAddModal}
        />
      </div>

      {/* Summary Cards */}
      <LogbookSummaryCards
        totalHours={totalHours}
        pendingCount={pendingCount}
        signedCount={signedCount}
        totalEntries={totalEntries}
      />

      {/* Table */}
      <LogbookTable
        entries={entries}
        runningTotal={totalHours}
        ataChapters={ataChapters.map((c) => ({
          value: c.chapter_number,
          label: `${c.chapter_number} - ${c.title}`,
        }))}
        acsCodesByEntry={acsCodesByEntry}
        initialOpenEntryId={openLogId}
        defaultOpenAddModal={openAddModal}
      />
    </div>
  );
}
