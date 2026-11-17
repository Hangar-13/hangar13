"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { resolveLessonIdForProgramWeek } from "@/lib/training-lessons";
import { resolveCourseVersionForLessonSubmission } from "@/lib/course-versions";
import { noActiveTrainingServerError } from "@/lib/training-enrollment-messages";
import { checkLessonPlayerCompletion } from "@/lib/lesson-player";
import type { LessonPlayerCompletionCheck } from "@/lib/lesson-player/types";
import { createLogbookEntry } from "@/app/actions/logbook";
import { revalidatePath } from "next/cache";

function courseworkHours(completion: LessonPlayerCompletionCheck): number {
  const contentSeconds = completion.content?.timeSpentSeconds ?? 0;
  const testSeconds = completion.test?.timeSpentSeconds ?? 0;
  const seconds = Math.max(0, contentSeconds) + Math.max(0, testSeconds);
  if (seconds <= 0) return 0;
  const hours = Math.round((seconds / 3600) * 100) / 100;
  return hours > 0 ? hours : 0.01;
}

async function recordCourseworkLogEntry(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  args: {
    userId: string;
    submissionId: string;
    existingLogbookEntryId: string | null;
    lessonId: string;
    lessonTitle: string;
    hours: number;
  }
): Promise<{ error?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  if (args.existingLogbookEntryId) {
    const { data: existing } = await supabase
      .from("logbook_entries")
      .select("id, status")
      .eq("id", args.existingLogbookEntryId)
      .eq("user_id", args.userId)
      .maybeSingle();
    if (existing && (existing.status === "draft" || existing.status === "rejected")) {
      const { error } = await supabase
        .from("logbook_entries")
        .update({
          hours_worked: args.hours,
          entry_date: today,
          source: "coursework",
        })
        .eq("id", existing.id);
      if (error) return { error: error.message };
      revalidatePath("/dashboard/student/logbook");
      return {};
    }
    if (existing) return {};
  }

  const { data: lesson } = await supabase
    .from("lessons")
    .select("title, ata_chapter_ids")
    .eq("id", args.lessonId)
    .maybeSingle();
  const title = String(lesson?.title ?? args.lessonTitle).trim() || args.lessonTitle;
  const ataIds = Array.isArray(lesson?.ata_chapter_ids)
    ? (lesson.ata_chapter_ids as number[])
    : [];
  let ataChapterNumbers: string[] = [];
  if (ataIds.length > 0) {
    const { data: chapters } = await supabase
      .from("ata_chapter")
      .select("id, chapter_number")
      .in("id", ataIds);
    const byId = new Map((chapters ?? []).map((row) => [row.id as number, String(row.chapter_number)]));
    ataChapterNumbers = ataIds.map((id) => byId.get(id)).filter((value): value is string => !!value);
  }

  const created = await createLogbookEntry({
    entryDate: today,
    startTime: "08:00",
    endTime: "09:00",
    hoursWorked: args.hours,
    source: "coursework",
    taskDescription: title,
    ataChapter: ataChapterNumbers[0] ?? "",
    ataChapterNumbers,
    certified: false,
  });
  if ("error" in created && created.error) return { error: created.error };
  const logbookEntryId = created.data?.id;
  if (!logbookEntryId) return { error: "Failed to create the coursework log entry." };

  const { error } = await supabase
    .from("lesson_submissions")
    .update({ logbook_entry_id: logbookEntryId })
    .eq("id", args.submissionId);
  return error ? { error: error.message } : {};
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

  const { data: pathMeta } = await supabase
    .from("training_paths")
    .select("organization_id")
    .eq("id", student.training_path_id)
    .maybeSingle();

  const versionContext = {
    userId: user.id,
    enrollmentSource: student.enrollment_source,
    pathOrganizationId: (pathMeta?.organization_id as string | null) ?? null,
  };

  const lessonId = await resolveLessonIdForProgramWeek(
    supabase,
    student,
    formData.weekNumber,
    versionContext
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

  const courseVersion = await resolveCourseVersionForLessonSubmission(
    supabase,
    lessonId,
    versionContext
  );

  const playerCompletion = await checkLessonPlayerCompletion(supabase, {
    lessonId,
    userId: user.id,
    courseVersionId: courseVersion?.id ?? null,
  });

  if (!playerCompletion.readyToSubmit) {
    return { error: playerCompletion.blockReason ?? "Finish the lesson before submitting." };
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
        reject_reason: null,
        mentor_notes: null,
        course_version_id: courseVersion?.id ?? null,
        player_completion: {
          checkedAt: playerCompletion.checkedAt,
          content: playerCompletion.content,
          test: playerCompletion.test,
        },
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

  const { data: lessonRow } = await supabase
    .from("lessons")
    .select("title")
    .eq("id", lessonId)
    .maybeSingle();
  const logResult = await recordCourseworkLogEntry(supabase, {
    userId: user.id,
    submissionId: submission.id,
    existingLogbookEntryId: (submission.logbook_entry_id as string | null) ?? null,
    lessonId,
    lessonTitle: String(lessonRow?.title ?? `Week ${formData.weekNumber}`),
    hours: courseworkHours(playerCompletion),
  });
  if (logResult.error) {
    return {
      error: `Your reflection was saved, but the log entry could not be created: ${logResult.error}`,
    };
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

  const lessonId = await resolveLessonIdForProgramWeek(
    supabase,
    student,
    weekNumber,
    {
      userId: user.id,
      enrollmentSource: student.enrollment_source,
    }
  );

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
