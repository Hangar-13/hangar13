"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { resolveLessonIdForProgramWeek } from "@/lib/training-lessons";
import { noActiveTrainingServerError } from "@/lib/training-enrollment-messages";
import {
  getTalentLmsApiEnrollmentConfig,
  talentLmsResolveLearnerUserId,
  talentLmsGetUserStatusInCourse,
  talentLmsIsUnitCompletedInPayload,
} from "@/lib/talentlms/api-enroll";
import { getLessonTalentContext } from "@/lib/talentlms/lesson-talent-context";
import { revalidatePath } from "next/cache";

type TalentCompletionFields = {
  talent_lms_unit_completed: boolean | null;
  talent_lms_completion_checked_at: string | null;
  talent_lms_completion_meta: Record<string, unknown> | null;
};

async function resolveTalentCompletionSnapshot(options: Readonly<{
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  userEmail: string | null | undefined;
  lessonId: string;
}>): Promise<{ error: string } | TalentCompletionFields> {
  const ctx = await getLessonTalentContext(
    options.supabase,
    options.lessonId
  );

  const { talentUrl, courseId, unitId } = ctx;

  const apiConfig = getTalentLmsApiEnrollmentConfig();
  const checkedIso = new Date().toISOString();

  if (!apiConfig) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: null,
      talent_lms_completion_meta: { skip_reason: "api_not_configured" },
    };
  }

  if (!talentUrl) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: null,
      talent_lms_completion_meta: { skip_reason: "no_talent_link_in_lesson" },
    };
  }

  if (!courseId) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: null,
      talent_lms_completion_meta: {
        skip_reason: "could_not_resolve_course_id",
        talent_url: talentUrl,
      },
    };
  }

  if (!unitId) {
    return {
      talent_lms_unit_completed: null,
      talent_lms_completion_checked_at: null,
      talent_lms_completion_meta: {
        skip_reason: "unit_not_in_link",
        talent_url: talentUrl,
        course_id: courseId,
      },
    };
  }

  const email = options.userEmail?.trim().toLowerCase();
  if (!email) {
    return {
      error:
        "Your account does not have an email address; Talent LMS verification cannot run.",
    };
  }

  const tlUser = await talentLmsResolveLearnerUserId(apiConfig, email);
  if (!tlUser.ok) {
    if (tlUser.status === 404) {
      return {
        error:
          "No Talent LMS learner matches your email yet. Open your Talent lesson once (or contact support), then try submitting again.",
      };
    }
    return {
      error: `Talent LMS could not look up your account (${tlUser.message}). Try again shortly.`,
    };
  }

  const progress = await talentLmsGetUserStatusInCourse({
    config: apiConfig,
    userId: tlUser.userId,
    courseId,
  });

  if (!progress.ok) {
    return {
      error: `Could not read your Talent LMS progress (${progress.message}). Try again in a moment.`,
    };
  }

  const verdict = talentLmsIsUnitCompletedInPayload(progress.payload, unitId);

  if (!verdict.found) {
    return {
      error:
        "Talent LMS has no matching unit in this course yet. Check that the lesson link uses the correct course and unit, complete the unit in Talent, then submit again.",
    };
  }

  if (!verdict.completed) {
    return {
      error:
        "Finish this week's Talent LMS lesson (complete the linked unit), then submit your reflection.",
    };
  }

  const unitSnap = progress.payload.units?.find(
    (u) => String(u.id ?? "") === String(unitId)
  );

  return {
    talent_lms_unit_completed: true,
    talent_lms_completion_checked_at: checkedIso,
    talent_lms_completion_meta: {
      course_id: courseId,
      unit_id: unitId,
      course_completion_status: progress.payload.completion_status,
      unit: unitSnap,
    },
  };
}

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

  const talentSnap = await resolveTalentCompletionSnapshot({
    supabase,
    userEmail: user.email,
    lessonId,
  });

  if ("error" in talentSnap) {
    return { error: talentSnap.error };
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
        talent_lms_unit_completed: talentSnap.talent_lms_unit_completed,
        talent_lms_completion_checked_at: talentSnap.talent_lms_completion_checked_at,
        talent_lms_completion_meta: talentSnap.talent_lms_completion_meta,
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
