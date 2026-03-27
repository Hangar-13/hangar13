"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { noActiveTrainingServerError } from "@/lib/training-enrollment-messages";
import { revalidatePath } from "next/cache";

export async function submitWeeklyReflection(formData: {
  weekNumber: number;
  reflectionText: string;
  curriculumItemId?: string;
  fileUrls?: Array<{
    url: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  }>;
}) {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to submit reflections." };
  }

  const { userTraining: apprentice } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!apprentice) {
    return {
      error: noActiveTrainingServerError(),
    };
  }

  // Validate reflection text length
  if (formData.reflectionText.length > 1000) {
    return { error: "Reflection text must be 1000 characters or less." };
  }

  // Validate file count
  if (formData.fileUrls && formData.fileUrls.length > 5) {
    return { error: "Maximum 5 files allowed." };
  }

  // Create or update submission
  const { data: submission, error: submissionError } = await supabase
    .from("weekly_submissions")
    .upsert(
      {
        user_training_id: apprentice.id,
        week_number: formData.weekNumber,
        curriculum_item_id: formData.curriculumItemId || null,
        reflection_text: formData.reflectionText,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      },
      {
        onConflict: "user_training_id,week_number",
      }
    )
    .select()
    .single();

  if (submissionError || !submission) {
    return {
      error: `Failed to save submission: ${submissionError?.message || "Unknown error"}`,
    };
  }

  // Delete existing file records for this submission (in case of update)
  await supabase
    .from("weekly_submission_files")
    .delete()
    .eq("submission_id", submission.id);

  // Insert file records
  if (formData.fileUrls && formData.fileUrls.length > 0) {
    const { error: filesError } = await supabase
      .from("weekly_submission_files")
      .insert(
        formData.fileUrls.map((file) => ({
          submission_id: submission.id,
          file_url: file.url,
          file_name: file.fileName,
          file_size: file.fileSize,
          file_type: file.fileType,
        }))
      );

    if (filesError) {
      // Note: Files are already uploaded, so we log the error but don't fail
      console.error("Failed to save file records:", filesError);
    }
  }

  revalidatePath("/dashboard/apprentice/training");
  revalidatePath(`/dashboard/apprentice/training/submit`);

  return { success: true, submissionId: submission.id };
}

export async function getWeeklySubmission(weekNumber: number) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in." };
  }

  const { userTraining: apprentice } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!apprentice) {
    return { error: noActiveTrainingServerError() };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("weekly_submissions")
    .select(
      `
      *,
      weekly_submission_files (*)
    `
    )
    .eq("user_training_id", apprentice.id)
    .eq("week_number", weekNumber)
    .single();

  if (submissionError && submissionError.code !== "PGRST116") {
    // PGRST116 is "no rows returned"
    return { error: submissionError.message };
  }

  return { submission: submission || null };
}
