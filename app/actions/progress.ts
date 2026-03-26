"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAcsCoverageByChapter, getLogbookEntriesByAcsCode, getAcsSignoffsByApprentice } from "@/app/actions/acs-codes";

export type ProgressData = {
  apprentice: { id: string; user_id: string; start_date: string; [key: string]: unknown };
  totalHours: number;
  currentWeek: number;
  totalWeeks: number;
  expectedHours: number;
  hoursDifference: number;
  approvedCount: number;
  ataChapterHours: Record<string, number>;
  ataChapterData: Record<string, { hours: number; status: string }>;
  chaptersWithHours: number;
  logbookEntries: Array<{
    id: string;
    entry_date: string;
    hours_worked: number;
    description: string;
    skills_practiced?: string[] | null;
    status: string;
    reject_reason?: string | null;
  }>;
  acsCoverageByChapter: Record<string, { satisfied: number; total: number; satisfiedCodeIds: number[] }>;
  entriesByAcsCode: Record<number, Array<{ id: string; entry_date: string; hours_worked: number; description: string; status: string }>>;
  acsSignoffs: Record<number, { signed_at: string; signer_initials: string; signer_full_name: string }>;
};

/** Get progress data for an apprentice (by apprentice record). Shared by apprentice and mentor pages. */
export async function getProgressDataForApprentice(
  apprentice: { id: string; user_id: string; start_date: string; [key: string]: unknown }
): Promise<ProgressData> {
  const supabase = await createServerSupabaseClient();

  const { data: logbookEntries } = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("user_training_id", apprentice.id);

  const totalHours =
    logbookEntries?.reduce((sum, entry) => sum + Number(entry.hours_worked || 0), 0) || 0;

  const startDate = new Date(apprentice.start_date);
  const now = new Date();
  const daysSinceStart = Math.floor(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
  const totalWeeks = 130;
  const expectedHours = currentWeek * 40;
  const hoursDifference = totalHours - expectedHours;
  const approvedCount =
    logbookEntries?.filter((entry) => entry.status === "approved").length || 0;

  /** Normalize chapter to 2 digits for consistent keys */
  const padChapter = (ch: string) => (ch.length === 1 && /^\d$/.test(ch) ? "0" + ch : ch);

  const ataChapterData: Record<string, { hours: number; status: string }> = {};
  logbookEntries?.forEach((entry) => {
    if (entry.skills_practiced && entry.skills_practiced.length > 0) {
      const hours = Number(entry.hours_worked || 0);
      entry.skills_practiced.forEach((skill: string) => {
        const ataMatch = skill?.match(/ATA:\s*(\d+)\s*-/);
        if (ataMatch) {
          const chapter = padChapter(ataMatch[1]);
          const currentData = ataChapterData[chapter] || { hours: 0, status: "none" };
          currentData.hours = currentData.hours + hours;
          if (entry.status === "submitted" || currentData.status === "submitted") {
            currentData.status = "submitted";
          } else if (entry.status === "draft" && currentData.status !== "submitted") {
            currentData.status = "draft";
          } else if (currentData.status === "none") {
            currentData.status = entry.status;
          }
          ataChapterData[chapter] = currentData;
        }
      });
    }
  });

  const ataChapterHours: Record<string, number> = {};
  Object.keys(ataChapterData).forEach((chapter) => {
    ataChapterHours[chapter] = ataChapterData[chapter].hours;
  });
  const chaptersWithHours = Object.keys(ataChapterHours).length;

  const { data: ataChaptersData } = await supabase
    .from("ata_chapter")
    .select("chapter_number")
    .order("chapter_number", { ascending: true });
  const ataChapterNumbers = (ataChaptersData ?? []).map((c) =>
    padChapter(c.chapter_number)
  );

  const [acsCoverageByChapter, entriesByAcsCode, acsSignoffs] = await Promise.all([
    getAcsCoverageByChapter(apprentice.id, ataChapterNumbers),
    getLogbookEntriesByAcsCode(apprentice.id),
    getAcsSignoffsByApprentice(apprentice.user_id),
  ]);

  return {
    apprentice,
    totalHours,
    currentWeek,
    totalWeeks,
    expectedHours,
    hoursDifference,
    approvedCount,
    ataChapterHours,
    ataChapterData,
    chaptersWithHours,
    logbookEntries: logbookEntries || [],
    acsCoverageByChapter,
    entriesByAcsCode,
    acsSignoffs,
  };
}
