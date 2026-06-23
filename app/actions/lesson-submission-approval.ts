"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";
import { mentorHasAccessToTrainee } from "@/lib/mentor-enrollments";

async function loadSubmissionContext(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  submissionId: string
): Promise<{ userTrainingId: string; userId: string } | null> {
  const { data: submission } = await supabase
    .from("lesson_submissions")
    .select("id, user_training_id")
    .eq("id", submissionId)
    .maybeSingle();

  if (!submission?.user_training_id) {
    return null;
  }

  const { data: ut } = await supabase
    .from("user_trainings")
    .select("id, user_id")
    .eq("id", submission.user_training_id)
    .maybeSingle();

  if (!ut) {
    return null;
  }

  return { userTrainingId: ut.id, userId: ut.user_id };
}

async function revalidateAfterReview(userTrainingId: string) {
  revalidatePath("/dashboard/mentor");
  revalidatePath("/dashboard/mentor/review-submissions");
  revalidatePath(`/dashboard/mentor/student/${userTrainingId}`);
  revalidatePath("/dashboard/student/training");
  revalidatePath("/dashboard/student/progress");
}

export async function approveLessonSubmission(
  submissionId: string,
  notes: string = ""
) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to review submissions." };
  }

  const ctx = await loadSubmissionContext(supabase, submissionId);
  if (!ctx) {
    return { error: "Submission not found." };
  }

  if (!(await mentorHasAccessToTrainee(supabase, user.id, ctx.userId))) {
    return { error: "You don't have permission to review this submission." };
  }

  const trimmedNotes = notes.trim();

  const { error: updateError } = await supabase
    .from("lesson_submissions")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      mentor_notes: trimmedNotes || null,
      reject_reason: null,
    })
    .eq("id", submissionId);

  if (updateError) {
    return { error: updateError.message || "Failed to approve submission." };
  }

  // Student notification created by database trigger on lesson_submissions.
  await revalidateAfterReview(ctx.userTrainingId);

  return { success: true };
}

export async function rejectLessonSubmission(
  submissionId: string,
  rejectReason: string
) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to review submissions." };
  }

  const trimmedReason = rejectReason.trim();
  if (!trimmedReason) {
    return { error: "Please provide a reason so the student knows what to fix." };
  }

  const ctx = await loadSubmissionContext(supabase, submissionId);
  if (!ctx) {
    return { error: "Submission not found." };
  }

  if (!(await mentorHasAccessToTrainee(supabase, user.id, ctx.userId))) {
    return { error: "You don't have permission to review this submission." };
  }

  const { error: updateError } = await supabase
    .from("lesson_submissions")
    .update({
      status: "rejected",
      reject_reason: trimmedReason,
      approved_by: null,
      approved_at: null,
      mentor_notes: null,
    })
    .eq("id", submissionId);

  if (updateError) {
    return { error: updateError.message || "Failed to reject submission." };
  }

  // Student notification created by database trigger on lesson_submissions.
  await revalidateAfterReview(ctx.userTrainingId);

  return { success: true };
}
