/**
 * Talent LMS scheduled reconcile (/api/cron/talent-lesson-completion).
 * Off unless explicitly enabled — avoids Surprise polling after deploy or stray cron hits.
 */
export function isTalentLessonCompletionCronEnabled(): boolean {
  const v = process.env.TALENTLMS_RECONCILE_CRON_ENABLED?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
