"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export interface DiscussionParticipant {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

export interface DiscussionMessage {
  id: string;
  user_training_id: string;
  lesson_id: string;
  question_index: number;
  sender_user_id: string;
  /** Null when the message has been deleted. */
  body: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LessonDiscussionData {
  viewer_role: "student" | "mentor";
  viewer_id: string;
  student: DiscussionParticipant | null;
  mentor: DiscussionParticipant | null;
  messages: DiscussionMessage[];
}

/** Load all discussion messages (every question) for a lesson + enrollment, plus participants. */
export async function getLessonDiscussion(
  userTrainingId: string,
  lessonId: string
): Promise<LessonDiscussionData | null> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_lesson_discussion", {
    p_user_training_id: userTrainingId,
    p_lesson_id: lessonId,
  });

  if (error) {
    console.error("Failed to load lesson discussion:", error);
    return null;
  }

  const payload = data as LessonDiscussionData | null;
  if (!payload) return null;

  return {
    viewer_role: payload.viewer_role,
    viewer_id: payload.viewer_id,
    student: payload.student ?? null,
    mentor: payload.mentor ?? null,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
  };
}

export async function postDiscussionMessage(params: {
  userTrainingId: string;
  lessonId: string;
  questionIndex: number;
  questionText: string | null;
  programWeek: number | null;
  body: string;
}): Promise<{ message?: DiscussionMessage; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const trimmed = params.body.trim();
  if (!trimmed) {
    return { error: "Message cannot be empty." };
  }

  const { data, error } = await supabase
    .from("lesson_discussion_messages")
    .insert({
      user_training_id: params.userTrainingId,
      lesson_id: params.lessonId,
      question_index: params.questionIndex,
      question_text: params.questionText,
      program_week: params.programWeek,
      sender_user_id: user.id,
      body: trimmed,
    })
    .select(
      "id, user_training_id, lesson_id, question_index, sender_user_id, body, edited_at, deleted_at, created_at, updated_at"
    )
    .single();

  if (error) {
    console.error("Failed to post discussion message:", error);
    return { error: error.message };
  }

  return { message: data as DiscussionMessage };
}

export async function editDiscussionMessage(params: {
  messageId: string;
  body: string;
}): Promise<{ message?: DiscussionMessage; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const trimmed = params.body.trim();
  if (!trimmed) {
    return { error: "Message cannot be empty." };
  }

  const { data, error } = await supabase
    .from("lesson_discussion_messages")
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq("id", params.messageId)
    .eq("sender_user_id", user.id)
    .is("deleted_at", null)
    .select(
      "id, user_training_id, lesson_id, question_index, sender_user_id, body, edited_at, deleted_at, created_at, updated_at"
    )
    .single();

  if (error) {
    console.error("Failed to edit discussion message:", error);
    return { error: error.message };
  }

  return { message: data as DiscussionMessage };
}

export async function deleteDiscussionMessage(params: {
  messageId: string;
}): Promise<{ message?: DiscussionMessage; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  // Soft delete: keep the row so the thread shows "message was deleted".
  const { data, error } = await supabase
    .from("lesson_discussion_messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.messageId)
    .eq("sender_user_id", user.id)
    .select(
      "id, user_training_id, lesson_id, question_index, sender_user_id, edited_at, deleted_at, created_at, updated_at"
    )
    .single();

  if (error) {
    console.error("Failed to delete discussion message:", error);
    return { error: error.message };
  }

  return { message: { ...(data as DiscussionMessage), body: null } };
}
