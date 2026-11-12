import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLessonPlayerProgress,
  lessonPlayerStatusSatisfied,
} from "@/lib/lesson-player/progress";
import type { LessonPlayerCompletionCheck } from "@/lib/lesson-player/types";

function slotFromProgress(
  progress: Awaited<ReturnType<typeof getLessonPlayerProgress>>,
  options?: { includeCoursewareRevision?: boolean }
): { status: string; score: number | null; coursewareRevision: number | null } | null {
  if (!progress.available) return null;
  const priorSatisfied =
    progress.priorCompletion != null &&
    lessonPlayerStatusSatisfied(progress.priorCompletion.status);
  const currentSatisfied = lessonPlayerStatusSatisfied(progress.status);
  const status = currentSatisfied
    ? progress.status
    : priorSatisfied
      ? progress.priorCompletion!.status
      : progress.status;
  const score =
    status === "passed" || status === "failed" || status === "completed"
      ? progress.percent === 1 && status === "failed"
        ? 0
        : currentSatisfied
          ? progress.percent
          : priorSatisfied
            ? 100
            : progress.percent
      : null;
  return {
    status,
    score: status === "passed" || status === "completed" ? 100 : score,
    coursewareRevision: options?.includeCoursewareRevision
      ? currentSatisfied
        ? progress.coursewareRevision
        : priorSatisfied
          ? progress.priorCompletion!.coursewareRevision
          : progress.coursewareRevision
      : null,
  };
}

export async function checkLessonPlayerCompletion(
  supabase: SupabaseClient,
  options: {
    lessonId: string;
    userId: string;
    courseVersionId?: string | null;
  }
): Promise<LessonPlayerCompletionCheck> {
  const [content, test] = await Promise.all([
    getLessonPlayerProgress(supabase, { ...options, kind: "content" }),
    getLessonPlayerProgress(supabase, { ...options, kind: "test" }),
  ]);

  const checkedAt = new Date().toISOString();
  let blockReason: string | null = null;

  const contentSatisfied =
    lessonPlayerStatusSatisfied(content.status) ||
    (content.priorCompletion != null &&
      lessonPlayerStatusSatisfied(content.priorCompletion.status));

  if (content.available && !contentSatisfied) {
    blockReason =
      content.status === "failed"
        ? "Pass this week's lesson before submitting your reflection."
        : "Finish this week's lesson before submitting your reflection.";
  } else if (test.available && !lessonPlayerStatusSatisfied(test.status)) {
    blockReason =
      test.status === "failed"
        ? "Pass this week's test before submitting your reflection."
        : "Pass this week's test before submitting your reflection.";
  }

  return {
    checkedAt,
    content: slotFromProgress(content, { includeCoursewareRevision: true }),
    test: (() => {
      const slot = slotFromProgress(test);
      return slot ? { status: slot.status, score: slot.score } : null;
    })(),
    readyToSubmit: blockReason == null,
    blockReason,
  };
}
