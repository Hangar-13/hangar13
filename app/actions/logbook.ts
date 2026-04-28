"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { noActiveTrainingServerError } from "@/lib/training-enrollment-messages";
import { revalidatePath } from "next/cache";
import { sortByAcsCode, sortStringArrayByAcsCode } from "@/lib/acs-code-sort";
import type { LogbookAdditionalInformation } from "@/lib/logbook-additional-information";

function normalizeLogPageNumber(
  n: number | null | undefined
): number | null {
  if (n == null) return null;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function createLogbookEntry(formData: {
  entryDate: string;
  startTime: string;
  endTime: string;
  hoursWorked: number;
  taskDescription: string;
  ataChapter: string;
  certified: boolean;
  selectedAcsCodeIds?: number[];
  logPageNumber?: number | null;
  aircraft?: string | null;
  additionalInformation?: LogbookAdditionalInformation | null;
}) {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to create logbook entries." };
  }

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!student) {
    return {
      error: "No active training selected. Choose a training in Find Training or contact your administrator.",
    };
  }

  // Fetch ATA chapter label from database
  const { data: ataChapter } = await supabase
    .from("ata_chapter")
    .select("chapter_number, title")
    .eq("chapter_number", formData.ataChapter)
    .maybeSingle();

  const ataLabel = ataChapter
    ? `${ataChapter.chapter_number} - ${ataChapter.title}`
    : formData.ataChapter;

  // Store ATA chapter info in skills_practiced array for now (we can add a dedicated column later)
  // Store description, and status based on certification
  const status = formData.certified ? "submitted" : "draft";

  const nowIso = new Date().toISOString();
  // Create logbook entry
  const logPage = normalizeLogPageNumber(
    formData.logPageNumber === undefined
      ? null
      : formData.logPageNumber === null
        ? null
        : Number(formData.logPageNumber)
  );
  const aircraft = formData.aircraft?.trim() || null;
  const additional = formData.additionalInformation ?? null;

  const { data: entry, error: entryError } = await supabase
    .from("logbook_entries")
    .insert({
      user_training_id: student.id,
      entry_date: formData.entryDate,
      hours_worked: formData.hoursWorked,
      description: formData.taskDescription,
      skills_practiced: [`ATA: ${ataLabel}`], // Store ATA chapter in skills_practiced for now
      status: status,
      log_page_number: logPage,
      aircraft,
      additional_information: additional,
      ...(status === "submitted" ? { submitted_at: nowIso } : {}),
    })
    .select()
    .single();

  if (entryError) {
    return { error: entryError.message || "Failed to create logbook entry." };
  }

  // Save ACS codes to logbook_entry_acs_pending
  const acsIds = formData.selectedAcsCodeIds ?? [];
  if (acsIds.length > 0) {
    const { error: acsError } = await supabase.from("logbook_entry_acs_pending").insert(
      acsIds.map((acs_code_id) => ({
        logbook_entry_id: entry.id,
        acs_code_id,
      }))
    );
    if (acsError) {
      console.error("Error saving ACS codes:", acsError);
    }
  }

  // Notification created by database trigger on logbook_entries

  // Revalidate the logbook and dashboard pages to show new entry
  revalidatePath("/dashboard/student/logbook");
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/progress");

  return { success: true, data: entry };
}

export async function updateLogbookEntry(
  entryId: string,
  formData: {
    entryDate: string;
    startTime: string;
    endTime: string;
    hoursWorked: number;
    taskDescription: string;
    ataChapter: string;
    certified: boolean;
    selectedAcsCodeIds?: number[];
    logPageNumber?: number | null;
    aircraft?: string | null;
    additionalInformation?: LogbookAdditionalInformation | null;
  }
) {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to update logbook entries." };
  }

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!student) {
    return {
      error: "No active training selected. Choose a training in Find Training or contact your administrator.",
    };
  }

  // Verify the entry belongs to this student and is draft or rejected
  const { data: existingEntry, error: fetchError } = await supabase
    .from("logbook_entries")
    .select("user_training_id, status")
    .eq("id", entryId)
    .single();

  if (fetchError || !existingEntry) {
    return { error: "Entry not found." };
  }

  if (existingEntry.user_training_id !== student.id) {
    return {
      error: "You don't have permission to update this entry.",
    };
  }

  if (existingEntry.status !== "draft" && existingEntry.status !== "rejected") {
    return {
      error: "Only draft or rejected entries can be edited.",
    };
  }

  // Fetch ATA chapter label from database
  const { data: ataChapter } = await supabase
    .from("ata_chapter")
    .select("chapter_number, title")
    .eq("chapter_number", formData.ataChapter)
    .maybeSingle();

  const ataLabel = ataChapter
    ? `${ataChapter.chapter_number} - ${ataChapter.title}`
    : formData.ataChapter;

  // Store ATA chapter info in skills_practiced array for now (we can add a dedicated column later)
  // Status: certified -> submitted (clear reject_reason when resubmitting); otherwise draft
  const status = formData.certified ? "submitted" : "draft";

  const logPage = normalizeLogPageNumber(
    formData.logPageNumber === undefined
      ? null
      : formData.logPageNumber === null
        ? null
        : Number(formData.logPageNumber)
  );
  const aircraft = formData.aircraft?.trim() || null;
  const additional = formData.additionalInformation ?? null;

  const nowIso = new Date().toISOString();
  // Update logbook entry
  const { data: entry, error: entryError } = await supabase
    .from("logbook_entries")
    .update({
      entry_date: formData.entryDate,
      hours_worked: formData.hoursWorked,
      description: formData.taskDescription,
      skills_practiced: [`ATA: ${ataLabel}`],
      status,
      log_page_number: logPage,
      aircraft,
      additional_information: additional,
      ...(formData.certified
        ? { reject_reason: null, submitted_at: nowIso }
        : { submitted_at: null }),
    })
    .eq("id", entryId)
    .select()
    .single();

  if (entryError) {
    return { error: entryError.message || "Failed to update logbook entry." };
  }

  // Replace ACS codes in logbook_entry_acs_pending
  await supabase
    .from("logbook_entry_acs_pending")
    .delete()
    .eq("logbook_entry_id", entryId);

  const acsIds = formData.selectedAcsCodeIds ?? [];
  if (acsIds.length > 0) {
    const { error: acsError } = await supabase.from("logbook_entry_acs_pending").insert(
      acsIds.map((acs_code_id) => ({
        logbook_entry_id: entryId,
        acs_code_id,
      }))
    );
    if (acsError) {
      console.error("Error saving ACS codes:", acsError);
    }
  }

  // Notification created by database trigger on logbook_entries

  // Revalidate the logbook and dashboard pages to show updated entry
  revalidatePath("/dashboard/student/logbook");
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/progress");

  return { success: true, data: entry };
}

/** Mentor-only: update ACS codes for a logbook entry (any status). Does not modify the entry itself. */
export async function updateLogbookEntryAcsCodesForMentor(
  entryId: string,
  selectedAcsCodeIds: number[]
) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in." };
  }

  const { data: entry, error: fetchError } = await supabase
    .from("logbook_entries")
    .select("id, user_training_id")
    .eq("id", entryId)
    .single();

  if (fetchError || !entry) {
    return { error: "Entry not found." };
  }

  const { data: student } = await supabase
    .from("user_trainings")
    .select("mentor_id")
    .eq("id", entry.user_training_id)
    .single();

  if (!student || student.mentor_id !== user.id) {
    return { error: "You don't have permission to edit this entry." };
  }

  await supabase
    .from("logbook_entry_acs_pending")
    .delete()
    .eq("logbook_entry_id", entryId);

  if (selectedAcsCodeIds.length > 0) {
    const { error: acsError } = await supabase
      .from("logbook_entry_acs_pending")
      .insert(
        selectedAcsCodeIds.map((acs_code_id) => ({
          logbook_entry_id: entryId,
          acs_code_id,
        }))
      );
    if (acsError) {
      return { error: acsError.message || "Failed to save ACS codes." };
    }
  }

  revalidatePath("/dashboard/mentor");
  revalidatePath("/dashboard/mentor/review-logs");
  revalidatePath(`/dashboard/mentor/student/${entry.user_training_id}`);

  return { success: true };
}

export async function clearPendingAcsForLogbookEntry(entryId: string) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in." };
  }

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!student) {
    return { error: noActiveTrainingServerError() };
  }

  const { data: existingEntry } = await supabase
    .from("logbook_entries")
    .select("user_training_id")
    .eq("id", entryId)
    .single();

  if (!existingEntry || existingEntry.user_training_id !== student.id) {
    return { error: "Entry not found or access denied." };
  }

  await supabase
    .from("logbook_entry_acs_pending")
    .delete()
    .eq("logbook_entry_id", entryId);

  return { success: true };
}

export async function getPendingAcsCodesForLogbookEntry(entryId: string): Promise<number[]> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!student) {
    return [];
  }

  const { data: existingEntry } = await supabase
    .from("logbook_entries")
    .select("user_training_id")
    .eq("id", entryId)
    .single();

  if (!existingEntry || existingEntry.user_training_id !== student.id) {
    return [];
  }

  const { data: pending } = await supabase
    .from("logbook_entry_acs_pending")
    .select("acs_code_id")
    .eq("logbook_entry_id", entryId);

  return (pending ?? []).map((p) => p.acs_code_id);
}

/** Get pending ACS code IDs for a logbook entry. Used by mentors when reviewing (RLS allows mentor access). */
export async function getPendingAcsCodesForLogbookEntryForReview(
  entryId: string
): Promise<number[]> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  const { data: pending } = await supabase
    .from("logbook_entry_acs_pending")
    .select("acs_code_id")
    .eq("logbook_entry_id", entryId);

  return (pending ?? []).map((p) => p.acs_code_id);
}

/** Get ACS code strings per logbook entry (for display in lists). Fetches from both pending and approved. */
export async function getAcsCodesByEntry(
  entryIds: string[]
): Promise<Record<string, string[]>> {
  if (entryIds.length === 0) return {};

  const supabase = await createServerSupabaseClient();

  const [pendingRes, approvedRes] = await Promise.all([
    supabase
      .from("logbook_entry_acs_pending")
      .select("logbook_entry_id, acs_code_id")
      .in("logbook_entry_id", entryIds),
    supabase
      .from("logbook_entry_acs")
      .select("logbook_entry_id, acs_code_id")
      .in("logbook_entry_id", entryIds),
  ]);

  const rows = [
    ...(pendingRes.data ?? []),
    ...(approvedRes.data ?? []),
  ];

  if (rows.length === 0) return {};

  const acsCodeIds = [...new Set(rows.map((r) => r.acs_code_id))];
  const { data: acsCodes } = await supabase
    .from("acs_code")
    .select("id, code")
    .in("id", acsCodeIds);

  const codeById = Object.fromEntries((acsCodes ?? []).map((c) => [c.id, c.code]));
  const result: Record<string, string[]> = {};
  for (const row of rows) {
    const entryId = row.logbook_entry_id as string;
    const code = codeById[row.acs_code_id];
    if (code) {
      if (!result[entryId]) result[entryId] = [];
      result[entryId].push(code);
    }
  }
  for (const k of Object.keys(result)) {
    result[k] = sortStringArrayByAcsCode([...new Set(result[k])]);
  }
  return result;
}

/** ACS rows for one entry (pending + signed), for read-only logbook entry views (match manager lesson list). */
export type LogbookEntryAcsDisplayRow = {
  id: number;
  code: string;
  description: string | null;
};

export async function getAcsCodeDisplayRowsForLogbookEntry(
  entryId: string
): Promise<LogbookEntryAcsDisplayRow[]> {
  const supabase = await createServerSupabaseClient();

  const [pendingRes, approvedRes] = await Promise.all([
    supabase
      .from("logbook_entry_acs_pending")
      .select("acs_code_id")
      .eq("logbook_entry_id", entryId),
    supabase
      .from("logbook_entry_acs")
      .select("acs_code_id")
      .eq("logbook_entry_id", entryId),
  ]);

  const acsCodeIds = [
    ...new Set([
      ...(pendingRes.data ?? []).map((r) => r.acs_code_id as number),
      ...(approvedRes.data ?? []).map((r) => r.acs_code_id as number),
    ]),
  ];
  if (acsCodeIds.length === 0) return [];

  const { data: acsRows } = await supabase
    .from("acs_code")
    .select("id, code, description")
    .in("id", acsCodeIds);

  const rows: LogbookEntryAcsDisplayRow[] = (acsRows ?? []).map((c) => ({
    id: c.id,
    code: c.code,
    description: c.description,
  }));
  return sortByAcsCode(rows);
}

/** Names and dates for student logbook entry status badges (browse mode). */
export type LogbookEntryStudentViewMeta = {
  studentName: string;
  mentorName: string;
  approverName: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  lastSavedAt: string;
};

export async function getLogbookEntryStudentViewMeta(
  entryId: string
): Promise<LogbookEntryStudentViewMeta | { error: string }> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { userTraining: ut } = await getCurrentUserTrainingContext(supabase, user.id);
  if (!ut) {
    return { error: "No active training." };
  }

  const { data: entry, error: entErr } = await supabase
    .from("logbook_entries")
    .select(
      "id, user_training_id, status, created_at, updated_at, submitted_at, approved_at, approved_by"
    )
    .eq("id", entryId)
    .maybeSingle();

  if (entErr || !entry) {
    return { error: "Entry not found." };
  }

  if (entry.user_training_id !== ut.id) {
    return { error: "Access denied." };
  }

  const { data: studentUser } = await supabase
    .from("users")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: utRow } = await supabase
    .from("user_trainings")
    .select("mentor_id")
    .eq("id", ut.id)
    .maybeSingle();

  let mentorName = "Mentor";
  if (utRow?.mentor_id) {
    const { data: m } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", utRow.mentor_id)
      .maybeSingle();
    if (m?.full_name?.trim()) mentorName = m.full_name.trim();
  }

  let approverName: string | null = null;
  if (entry.approved_by) {
    const { data: ap } = await supabase
      .from("users")
      .select("full_name")
      .eq("id", entry.approved_by)
      .maybeSingle();
    if (ap?.full_name?.trim()) approverName = ap.full_name.trim();
  }

  const studentName =
    (studentUser?.full_name && studentUser.full_name.trim()) ||
    user.email ||
    "Student";

  return {
    studentName,
    mentorName,
    approverName,
    submittedAt: (entry as { submitted_at?: string | null }).submitted_at ?? null,
    approvedAt: entry.approved_at ?? null,
    lastSavedAt: entry.updated_at ?? entry.created_at,
  };
}
