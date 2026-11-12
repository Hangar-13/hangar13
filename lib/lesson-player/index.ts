/**
 * Lesson player boundary.
 *
 * Callers outside this folder should import from `@/lib/lesson-player` only.
 * The SCORM runtime, zip parsing, and file storage live under `./scorm` and
 * can be replaced without changing progress, completion, or package slots.
 */

export type {
  LessonPackageKind,
  LessonPackageSlots,
  LessonPackageSummary,
  LessonPlayerCompletionCheck,
  LessonPlayerCompletionRecord,
  LessonPlayerLaunch,
  LessonPlayerProgress,
  LessonPlayerStatus,
} from "@/lib/lesson-player/types";

export { lessonPlayerHref, safeReturnPath } from "@/lib/lesson-player/href";

export {
  getLessonPlayerProgress,
  lessonPlayerStatusSatisfied,
} from "@/lib/lesson-player/progress";

export { checkLessonPlayerCompletion } from "@/lib/lesson-player/completion";

export {
  clearLessonPackage,
  listLessonPackages,
} from "@/lib/lesson-player/scorm/store-package";

export {
  commitLessonPlayerAttempt,
  getLessonPlayerLaunch,
  readLessonPackageFile,
} from "@/lib/lesson-player/scorm/runtime";

export { replaceLessonPackage } from "@/lib/lesson-player/scorm/store-package";
