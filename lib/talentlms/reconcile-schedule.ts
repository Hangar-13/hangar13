const PACIFIC = "America/Los_Angeles";

/**
 * Returns local hour [0–23] and minute [0–59] in America/Los_Angeles for `when`.
 */
function pacificHourMinute(when: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC,
    hour12: false,
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(when);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { hour, minute };
}

/**
 * True during Pacific “daily sync” windows (~5am and ~noon America/Los_Angeles).
 *
 * Pair with a frequent platform cron (for example each quarter-hour) so the actual run time
 * tracks DST (UTC cron alone cannot pin two Pacific clocks year-round).
 *
 * At most twice per slot (e.g. 12:00 and 12:15) — reconcile is **idempotent**.
 */
export function isPacificTalentReconcileWindow(when = new Date()): boolean {
  const { hour, minute } = pacificHourMinute(when);
  return (hour === 5 || hour === 12) && minute < 30;
}
