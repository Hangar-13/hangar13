/**
 * Public lesson-player contract.
 *
 * The rest of the app imports these types and the functions in `index.ts`.
 * How a package is rendered (today: SCORM 1.2 in an iframe) stays inside
 * `lib/lesson-player/scorm` and `components/lesson-player`.
 */

export type LessonPackageKind = "content" | "test";

export type LessonPlayerStatus =
  | "not_attempted"
  | "incomplete"
  | "browsed"
  | "completed"
  | "passed"
  | "failed"
  | "unavailable";

/** What the training page and progress card need. No runtime details. */
export type LessonPlayerProgress = {
  kind: LessonPackageKind;
  available: boolean;
  percent: number;
  status: LessonPlayerStatus;
  statusLabel: string | null;
  /** In-app path that opens the player. Null when no package is attached. */
  playHref: string | null;
  packageId: string | null;
  packageTitle: string | null;
  updatedAt: string | null;
  message: string | null;
  /** Revision of the sitting shown above. Null for tests and courseware that has never been uploaded. */
  coursewareRevision: number | null;
  /** A finished sitting from an earlier courseware revision, when the current file is not finished. */
  priorCompletion: { status: LessonPlayerStatus; coursewareRevision: number } | null;
};

export type LessonPackageSummary = {
  id: string;
  kind: LessonPackageKind;
  title: string;
  schemaVersion: string;
  masteryScore: number | null;
  originalFilename: string | null;
  scoCount: number;
  uploadedAt: string;
};

export type LessonPackageSlots = {
  content: LessonPackageSummary | null;
  test: LessonPackageSummary | null;
};

/** Stored on lesson_submissions.player_completion. */
export type LessonPlayerCompletionRecord = {
  checkedAt: string;
  content: { status: string; score: number | null; coursewareRevision: number | null } | null;
  test: { status: string; score: number | null } | null;
};

export type LessonPlayerCompletionCheck = LessonPlayerCompletionRecord & {
  readyToSubmit: boolean;
  blockReason: string | null;
};

export type LessonPlayerLaunch = {
  lessonId: string;
  kind: LessonPackageKind;
  packageId: string;
  title: string;
  launchPath: string;
  /** Opaque key so the frame reloads when the saved attempt changes. */
  resumeKey: string;
  /** Runtime values the current viewer needs. Opaque to callers. */
  initialCmi: Record<string, string>;
};
