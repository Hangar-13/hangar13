"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { resolveLessonIdForProgramWeek } from "@/lib/training-lessons";
import { noActiveTrainingServerError } from "@/lib/training-enrollment-messages";
import { revalidatePath } from "next/cache";

export async function submitWeeklyReflection(formData: {
  weekNumber: number;
  reflectionText: string;
  fileUrls?: Array<{
    url: string;
    fileName: string;
    fileSize: number;
    fileType: string;
  }>;
}) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "You must be logged in to submit reflections." };
  }

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!student) {
    return {
      error: noActiveTrainingServerError(),
    };
  }

  const lessonId = await resolveLessonIdForProgramWeek(
    supabase,
    student,
    formData.weekNumber
  );

  if (!lessonId) {
    return {
      error: "Could not find a lesson for this week for your enrollment.",
    };
  }

  if (formData.reflectionText.length > 1000) {
    return { error: "Reflection text must be 1000 characters or less." };
  }

  if (formData.fileUrls && formData.fileUrls.length > 5) {
    return { error: "Maximum 5 files allowed." };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("lesson_submissions")
    .upsert(
      {
        user_training_id: student.id,
        lesson_id: lessonId,
        week_number: formData.weekNumber,
        reflection_text: formData.reflectionText,
        status: "submitted",
        submitted_at: new Date().toISOString(),
      },
      {
        onConflict: "user_training_id,lesson_id",
      }
    )
    .select()
    .single();

  if (submissionError || !submission) {
    return {
      error: `Failed to save submission: ${submissionError?.message || "Unknown error"}`,
    };
  }

  await supabase.from("lesson_submission_files").delete().eq("submission_id", submission.id);

  if (formData.fileUrls && formData.fileUrls.length > 0) {
    const { error: filesError } = await supabase.from("lesson_submission_files").insert(
      formData.fileUrls.map((file) => ({
        submission_id: submission.id,
        file_url: file.url,
        file_name: file.fileName,
        file_size: file.fileSize,
        file_type: file.fileType,
      }))
    );

    if (filesError) {
      console.error("Failed to save file records:", filesError);
    }
  }

  revalidatePath("/dashboard/student/training");
  revalidatePath(`/dashboard/student/training/submit`);

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

  const { userTraining: student } = await getCurrentUserTrainingContext(supabase, user.id);

  if (!student) {
    return { error: noActiveTrainingServerError() };
  }

  const lessonId = await resolveLessonIdForProgramWeek(supabase, student, weekNumber);

  if (!lessonId) {
    return { submission: null };
  }

  const { data: submission, error: submissionError } = await supabase
    .from("lesson_submissions")
    .select(
      `
      *,
      lesson_submission_files (*)
    `
    )
    .eq("user_training_id", student.id)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (submissionError && submissionError.code !== "PGRST116") {
    return { error: submissionError.message };
  }

  return { submission: submission || null };
}
