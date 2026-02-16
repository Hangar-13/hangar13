"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export type NotificationType = "logs_awaiting" | "logs_approved" | "logs_rejected" | "acs_signed";

export interface Notification {
  id: string;
  recipient_user_id: string;
  type: NotificationType;
  subject_user_id: string;
  message: string;
  log_count: number;
  log_entry_ids: string[];
  read_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Create or stack a notification via RPC. Uses SECURITY DEFINER to bypass RLS
 * so User A can create notifications for User B (recipient). */
export async function createOrStackNotification(params: {
  recipientUserId: string;
  type: NotificationType;
  subjectUserId: string;
  subjectDisplayName: string;
  logEntryId: string;
}) {
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.rpc("create_or_stack_notification", {
    p_recipient_user_id: params.recipientUserId,
    p_type: params.type,
    p_subject_user_id: params.subjectUserId,
    p_subject_display_name: params.subjectDisplayName,
    p_log_entry_id: params.logEntryId,
  });

  if (error) {
    console.error("Failed to create notification:", error);
  }
}

/** Get unread notifications for the current user. */
export async function getNotificationsForUser(): Promise<Notification[]> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return [];
  }

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_user_id", user.id)
    .is("read_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch notifications:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    ...row,
    log_entry_ids: (row.log_entry_ids ?? []) as string[],
  })) as Notification[];
}

/** Delete a notification when the user clicks it (after redirect). */
export async function deleteNotification(notificationId: string) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("recipient_user_id", user.id);

  if (error) {
    return { error: error.message };
  }
  return { success: true };
}

/** Delete all unread notifications for the current user (Mark all read / Clear all). */
export async function deleteAllNotificationsForUser() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("recipient_user_id", user.id)
    .is("read_at", null);

  if (error) {
    return { error: error.message };
  }
  return { success: true };
}
