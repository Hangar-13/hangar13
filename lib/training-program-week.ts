/**
 * "Week" in the student UI is the program lesson index (1-based), not calendar week.
 * Aligns Current Training, Progress, dashboard, and submission flows.
 */

export type ProgramLessonWeek = Readonly<{
  /** 1-based lesson index in the path, clamped to the path length. */
  currentWeek: number;
  /** Number of lessons in the training path (0 if none). */
  totalWeeks: number;
}>;

/**
 * Computes display week from enrollment start date and expanded path lesson count.
 * Calendar time suggests a raw week; we clamp to [1, lessonCount] when the path has lessons.
 */
export function computeProgramLessonWeek(options: Readonly<{
  startDateIso: string;
  lessonCount: number;
  /** `?week=` query — must be a positive integer when set. */
  explicitWeek?: number;
}>): ProgramLessonWeek {
  const lessonCount = Math.max(0, Math.floor(options.lessonCount));

  const now = new Date();
  const startDate = new Date(options.startDateIso);
  const daysSinceStart = Math.floor(
    (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const rawWeek =
    typeof options.explicitWeek === "number" &&
    Number.isFinite(options.explicitWeek) &&
    options.explicitWeek >= 1
      ? Math.floor(options.explicitWeek)
      : Math.max(1, Math.floor(daysSinceStart / 7) + 1);

  if (lessonCount <= 0) {
    return { currentWeek: 0, totalWeeks: 0 };
  }

  const currentWeek = Math.min(Math.max(rawWeek, 1), lessonCount);
  return { currentWeek, totalWeeks: lessonCount };
}

/** Total OJT hours target used for pace cards (logbook vs expected). */
export const DEFAULT_FULL_PROGRAM_LOGBOOK_HOURS = 5200;

/** Expected OJT hours if pace is linear through the program (full-program target hours). */
export function expectedLogbookHoursForLessonWeek(
  currentWeek: number,
  totalWeeks: number,
  fullProgramTargetHours: number
): number {
  if (totalWeeks <= 0 || currentWeek <= 0) return 0;
  return Math.round((currentWeek / totalWeeks) * fullProgramTargetHours);
}
