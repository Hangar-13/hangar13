import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { LogbookSummaryCards } from "@/components/student/logbook-summary-cards";
import { LogbookTable, type LogbookEntry } from "@/components/student/logbook-table";
import { LogbookExportButton } from "@/components/student/logbook-export-button";
import { AddEntryModal } from "@/components/student/add-entry-modal";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { queryLogbookEntriesForOwner, type LogbookEntryRow } from "@/lib/logbook-entries-query";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";

async function getLogbookEntries(userId: string): Promise<LogbookEntryRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data: logbookEntries, error } = await queryLogbookEntriesForOwner(
    supabase,
    userId
  );
  if (error) {
    console.error("getLogbookEntries:", error.message);
  }

  return logbookEntries ?? [];
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

  const [entries, ataChapters, profile] = await Promise.all([
    getLogbookEntries(user.id),
    getAtaChapters(),
    fetchSessionUserProfile(supabase),
  ]);

  const studentName = profile?.full_name?.trim() || "Student";

  const entriesForTable = entries as LogbookEntry[];

  const acsCodesByEntry = await getAcsCodesByEntry(entriesForTable.map((e) => e.id));

  // Calculate summary statistics
  const totalHours = entriesForTable.reduce((sum, entry) => sum + (parseFloat(entry.hours_worked?.toString() || "0") || 0), 0);
  const pendingCount = entriesForTable.filter((e) => e.status === "submitted").length;
  const signedCount = entriesForTable.filter((e) => e.status === "approved").length;
  const totalEntries = entriesForTable.length;

  // Entries already have skills_practiced which we're using for ATA chapter

  return (
    <DashboardPageShell>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">OJT Logbook</h1>
          <p className="text-base text-muted-foreground">
            Track your daily work and hours
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LogbookExportButton
            studentName={studentName}
            entries={entriesForTable}
            ataChapters={ataChapters.map((c) => ({
              chapter_number: c.chapter_number,
              title: c.title,
            }))}
            acsCodesByEntry={acsCodesByEntry}
          />
          <AddEntryModal
            ataChapters={ataChapters.map((c) => ({
              value: c.chapter_number,
              label: `${c.chapter_number} - ${c.title}`,
            }))}
            defaultOpen={openAddModal}
          />
        </div>
      </div>

      <DashboardContentFrame className="space-y-6">
        <LogbookSummaryCards
          totalHours={totalHours}
          pendingCount={pendingCount}
          signedCount={signedCount}
          totalEntries={totalEntries}
        />

        <LogbookTable
          entries={entriesForTable}
          runningTotal={totalHours}
          ataChapters={ataChapters.map((c) => ({
            value: c.chapter_number,
            label: `${c.chapter_number} - ${c.title}`,
          }))}
          acsCodesByEntry={acsCodesByEntry}
          initialOpenEntryId={openLogId}
          defaultOpenAddModal={openAddModal}
        />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}
