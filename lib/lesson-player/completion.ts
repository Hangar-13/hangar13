import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getLessonPlayerProgress,
  lessonPlayerStatusSatisfied,
} from "@/lib/lesson-player/progress";
import type {
  LessonPlayerCompletionCheck,
  LessonPlayerCompletionRecord,
} from "@/lib/lesson-player/types";

function slotFromProgress(
  progress: Awaited<ReturnType<typeof getLessonPlayerProgress>>
): { status: string; score: number | null } | null {
  if (!progress.available) return null;
  const score =
    progress.status === "passed" ||
    progress.status === "failed" ||
    progress.status === "completed"
      ? progress.percent === 1 && progress.status === "failed"
        ? 0
        : progress.percent
      : null;
  return {
    status: progress.status,
    score: progress.status === "passed" || progress.status === "completed" ? 100 : score,
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

  if (content.available && !lessonPlayerStatusSatisfied(content.status)) {
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
    content: slotFromProgress(content),
    test: slotFromProgress(test),
    readyToSubmit: blockReason == null,
    blockReason,
  };
}

export function describeStoredCompletion(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Partial<LessonPlayerCompletionRecord>;
  const contentOk = lessonPlayerStatusSatisfied(rec.content?.status);
  const testOk = lessonPlayerStatusSatisfied(rec.test?.status);
  if (contentOk && testOk) {
    return "Lesson and test were passed when this reflection was submitted.";
  }
  if (contentOk) {
    return "Lesson was passed when this reflection was submitted.";
  }
  if (testOk) {
    return "Test was passed when this reflection was submitted.";
  }
  return null;
}
