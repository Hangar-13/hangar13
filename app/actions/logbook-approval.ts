"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

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
    .select("user_training_id")
    .eq("id", entryId)
    .single();

  const studentId = (entry as { user_training_id?: string })?.user_training_id;

  // Notification created by database trigger on logbook_entries (approve_logbook_entry RPC updates status)

  revalidatePath("/dashboard/mentor");
  revalidatePath("/dashboard/mentor/review-logs");
  if (studentId) {
    revalidatePath(`/dashboard/mentor/student/${studentId}`);
  }
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/progress");

  return { success: true };
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
    .select(
      `
      *,
      user_trainings:user_training_id (
        id,
        mentor_id,
        user_id
      )
    `
    )
    .eq("id", entryId)
    .single();

  if (entryError || !entry) {
    return { error: "Entry not found." };
  }

  const student = entry.user_trainings as { id?: string; mentor_id?: string; user_id?: string } | null;
  if (student?.mentor_id !== user.id) {
    return { error: "You don't have permission to reject this entry." };
  }

  const studentId = student?.id;

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
  if (studentId) {
    revalidatePath(`/dashboard/mentor/student/${studentId}`);
  }
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/progress");

  return { success: true };
}

