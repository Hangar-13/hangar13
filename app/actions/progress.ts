"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  getAcsCoverageByChapter,
  getLogbookEntriesByAcsCode,
  getAcsSignoffsByStudent,
} from "@/app/actions/acs-codes";
import {
  getEnrollmentLessonSnapshot,
  type LessonProgressItem,
} from "@/lib/training-progress";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { queryLogbookEntriesForOwner } from "@/lib/logbook-entries-query";

export type ProgressData = {
  student: { id: string; user_id: string; start_date: string; [key: string]: unknown };
  totalHours: number;
  /** Curriculum: hours from submitted lessons vs program total (from DB). */
  trainingHoursCompleted: number;
  trainingHoursRequired: number;
  trainingProgressPercent: number;
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
    log_page_number?: number | null;
    aircraft?: string | null;
    additional_information?: unknown;
  }>;
  acsCoverageByChapter: Record<
    string,
    { satisfied: number; total: number; satisfiedCodeIds: number[] }
  >;
  entriesByAcsCode: Record<
    number,
    Array<{ id: string; entry_date: string; hours_worked: number; description: string; status: string }>
  >;
  acsSignoffs: Record<
    number,
    { signed_at: string; signer_initials: string; signer_full_name: string }
  >;
};

type LessonSnapshot = Awaited<ReturnType<typeof getEnrollmentLessonSnapshot>>;

const EMPTY_LESSON_SNAPSHOT: LessonSnapshot = {
  itemsWithProgress: [] as LessonProgressItem[],
  completedItems: 0,
  totalItems: 0,
  hoursCompleted: 0,
  hoursRequired: 0,
  trainingProgressPercent: 0,
};

async function buildProgressData(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  studentRecord: ProgressData["student"],
  userId: string,
  enrollmentIds: string[],
  trainingSnap: LessonSnapshot
): Promise<ProgressData> {
  let logbookEntries: ProgressData["logbookEntries"] = [];
  const { data, error: logbookFetchErr } = await queryLogbookEntriesForOwner(
    supabase,
    studentRecord.user_id
  );
  if (logbookFetchErr) {
    console.error("buildProgressData logbook_entries:", logbookFetchErr.message);
  }
  logbookEntries = (data ?? []) as ProgressData["logbookEntries"];

  const totalHours =
    logbookEntries.reduce((sum, entry) => sum + Number(entry.hours_worked || 0), 0) || 0;

  const startDate = new Date(studentRecord.start_date);
  const now = new Date();
  const daysSinceStart = Math.floor(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);
  const totalWeeks = 130;
  const expectedHours = currentWeek * 40;
  const hoursDifference = totalHours - expectedHours;
  const approvedCount =
    logbookEntries.filter((entry) => entry.status === "approved").length || 0;

  /** Normalize chapter to 2 digits for consistent keys */
  const padChapter = (ch: string) => (ch.length === 1 && /^\d$/.test(ch) ? "0" + ch : ch);

  const ataChapterData: Record<string, { hours: number; status: string }> = {};
  logbookEntries.forEach((entry) => {
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
    getAcsCoverageByChapter(enrollmentIds, ataChapterNumbers),
    getLogbookEntriesByAcsCode(enrollmentIds),
    getAcsSignoffsByStudent(userId),
  ]);

  return {
    student: studentRecord,
    totalHours,
    trainingHoursCompleted: trainingSnap.hoursCompleted,
    trainingHoursRequired: trainingSnap.hoursRequired,
    trainingProgressPercent: trainingSnap.trainingProgressPercent,
    currentWeek,
    totalWeeks,
    expectedHours,
    hoursDifference,
    approvedCount,
    ataChapterHours,
    ataChapterData,
    chaptersWithHours,
    logbookEntries,
    acsCoverageByChapter,
    entriesByAcsCode,
    acsSignoffs,
  };
}

/** Progress for one enrollment (mentor views and legacy callers). */
export async function getProgressDataForStudent(
  student: {
    id: string;
    user_id: string;
    start_date: string;
    training_path_id: string;
    [key: string]: unknown;
  }
): Promise<ProgressData> {
  const supabase = await createServerSupabaseClient();

  const trainingSnap = await getEnrollmentLessonSnapshot(supabase, student.id, {
    training_path_id: student.training_path_id,
  });

  return buildProgressData(supabase, student, student.user_id, [student.id], trainingSnap);
}

/**
 * Aggregates logbook + ACS coverage across all of the user’s enrollments; logbook hours
 * are per user (not per enrollment). Lesson-hour progress uses the active curriculum
 * enrollment when set, otherwise the most recently started enrollment.
 */
export async function getProgressDataForUser(userId: string): Promise<ProgressData> {
  const supabase = await createServerSupabaseClient();

  const { data: utRows } = await supabase
    .from("user_trainings")
    .select("*")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });

  const enrollmentIds = (utRows ?? []).map((r) => r.id as string);

  const { userTraining: activeUt } = await getCurrentUserTrainingContext(supabase, userId);
  const anchorUt = activeUt ?? utRows?.[0] ?? null;

  const studentRecord: ProgressData["student"] = anchorUt
    ? (anchorUt as ProgressData["student"])
    : {
        id: "",
        user_id: userId,
        start_date: new Date().toISOString().slice(0, 10),
        training_path_id: "",
      };

  const trainingSnap = anchorUt
    ? await getEnrollmentLessonSnapshot(supabase, anchorUt.id as string, {
        training_path_id: anchorUt.training_path_id as string,
      })
    : EMPTY_LESSON_SNAPSHOT;

  return buildProgressData(supabase, studentRecord, userId, enrollmentIds, trainingSnap);
}
