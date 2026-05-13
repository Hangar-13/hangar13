"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import {
  fetchTraineeUserIdsForMentor,
  mentorHasAccessToTrainee,
} from "@/lib/mentor-enrollments";

async function revalidateMentorStudentPathsForTrainee(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  traineeUserId: string
) {
  const { data: uts } = await supabase
    .from("user_trainings")
    .select("id")
    .eq("user_id", traineeUserId);
  for (const ut of uts ?? []) {
    revalidatePath(`/dashboard/mentor/student/${ut.id}`);
  }
}

export async function approveLogbookEntry(
  entryId: string,
  acsCodeIds: number[] = []
) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to approve entries." };
  }

  const { data: result, error: rpcError } = await supabase.rpc("approve_logbook_entry", {
    p_entry_id: entryId,
    p_approver_id: user.id,
    p_acs_code_ids: acsCodeIds,
  });

  if (rpcError) {
    return { error: rpcError.message || "Failed to approve entry." };
  }

  const res = result as { error?: string; success?: boolean };
  if (res.error) {
    return { error: res.error };
  }

  const { data: entry } = await supabase
    .from("logbook_entries")
    .select("user_id")
    .eq("id", entryId)
    .single();

  const traineeUserId = (entry as { user_id?: string })?.user_id;

  // Notification created by database trigger on logbook_entries (approve_logbook_entry RPC updates status)

  revalidatePath("/dashboard/mentor");
  revalidatePath("/dashboard/mentor/review-logs");
  if (traineeUserId) {
    await revalidateMentorStudentPathsForTrainee(supabase, traineeUserId);
  }
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/progress");

  return { success: true };
}

/** Approve specific submitted logbook rows (mentor must have signing access to each trainee). */
export async function approvePendingLogbookEntriesByIds(
  entryIds: string[]
): Promise<
  | { success: true; approvedCount: number; warning?: string }
  | { error: string; approvedCount?: number }
> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to approve entries." };
  }

  const ids = [...new Set(entryIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    revalidatePath("/dashboard/mentor/review-logs");
    return { success: true, approvedCount: 0 };
  }

  const traineeIds = await fetchTraineeUserIdsForMentor(supabase, user.id);
  if (traineeIds.length === 0) {
    revalidatePath("/dashboard/mentor/review-logs");
    return { success: true, approvedCount: 0 };
  }

  const { data: eligibleRows, error: qErr } = await supabase
    .from("logbook_entries")
    .select("id, user_id")
    .in("id", ids)
    .in("user_id", traineeIds)
    .eq("status", "submitted");

  if (qErr) {
    return { error: qErr.message };
  }

  const rowById = new Map((eligibleRows ?? []).map((r) => [r.id, r]));
  const orderedToApprove = ids.filter((id) => rowById.has(id));

  let approvedCount = 0;
  let failCount = 0;
  let firstError: string | null = null;
  const affectedTrainees = new Set<string>();

  for (const id of orderedToApprove) {
    const row = rowById.get(id)!;
    const { data: result, error: rpcError } = await supabase.rpc("approve_logbook_entry", {
      p_entry_id: id,
      p_approver_id: user.id,
      p_acs_code_ids: [],
    });

    if (rpcError) {
      failCount += 1;
      firstError ??= rpcError.message || "Failed to approve entry.";
      continue;
    }

    const res = result as { error?: string; success?: boolean };
    if (res.error) {
      failCount += 1;
      firstError ??= res.error;
      continue;
    }

    approvedCount += 1;
    affectedTrainees.add(row.user_id);
  }

  revalidatePath("/dashboard/mentor");
  revalidatePath("/dashboard/mentor/review-logs");
  for (const tid of affectedTrainees) {
    await revalidateMentorStudentPathsForTrainee(supabase, tid);
  }
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/progress");

  if (approvedCount === 0 && firstError) {
    return { error: firstError, approvedCount: 0 };
  }

  return {
    success: true,
    approvedCount,
    ...(failCount > 0
      ? {
          warning: `${failCount} log entr${failCount === 1 ? "y" : "ies"} could not be signed. ${firstError ?? ""}`.trim(),
        }
      : {}),
  };
}

/** Approve every submitted logbook row for trainees this mentor may sign. */
export async function approveAllPendingLogbookEntries(): Promise<
  | { success: true; approvedCount: number; warning?: string }
  | { error: string; approvedCount?: number }
> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to approve entries." };
  }

  const traineeIds = await fetchTraineeUserIdsForMentor(supabase, user.id);
  if (traineeIds.length === 0) {
    revalidatePath("/dashboard/mentor/review-logs");
    return { success: true, approvedCount: 0 };
  }

  const { data: pending, error: qErr } = await supabase
    .from("logbook_entries")
    .select("id, user_id")
    .in("user_id", traineeIds)
    .eq("status", "submitted");

  if (qErr) {
    return { error: qErr.message };
  }

  const rows = pending ?? [];
  if (rows.length === 0) {
    revalidatePath("/dashboard/mentor/review-logs");
    return { success: true, approvedCount: 0 };
  }

  return approvePendingLogbookEntriesByIds(rows.map((r) => r.id));
}

export async function rejectLogbookEntry(entryId: string, rejectReason: string) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to reject entries." };
  }

  const { data: entry, error: entryError } = await supabase
    .from("logbook_entries")
    .select("id, user_id")
    .eq("id", entryId)
    .single();

  if (entryError || !entry) {
    return { error: "Entry not found." };
  }

  if (!(await mentorHasAccessToTrainee(supabase, user.id, entry.user_id))) {
    return { error: "You don't have permission to reject this entry." };
  }

  const traineeUserId = entry.user_id;

  const { error: updateError } = await supabase
    .from("logbook_entries")
    .update({
      status: "rejected",
      reject_reason: rejectReason || null,
    })
    .eq("id", entryId);

  if (updateError) {
    return { error: updateError.message || "Failed to reject entry." };
  }

  // Notification created by database trigger on logbook_entries

  revalidatePath("/dashboard/mentor");
  revalidatePath("/dashboard/mentor/review-logs");
  await revalidateMentorStudentPathsForTrainee(supabase, traineeUserId);
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/progress");

  return { success: true };
}

