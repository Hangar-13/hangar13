"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { resolveLessonIdForProgramWeek } from "@/lib/training-lessons";
import { noActiveTrainingServerError } from "@/lib/training-enrollment-messages";
import {
  fetchTalentLessonProgressSnapshot,
  type TalentLessonProgressSnapshot,
} from "@/lib/talentlms/fetch-lesson-progress";

export async function refreshTalentLessonProgress(
  weekNumber: number
): Promise<TalentLessonProgressSnapshot | { error: string }> {
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
    weekNumber
  );

  if (!lessonId) {
    return {
      error: "Could not find a lesson for this week for your enrollment.",
    };
  }

  return fetchTalentLessonProgressSnapshot(supabase, {
    userEmail: user.email,
    lessonId,
    trainingPathId: student.training_path_id,
  });
}
