/** English short month labels for consistent DD-MMM-YYYY UI dates. */
const UI_MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parse an ISO date string or timestamp for display in local time.
 * Bare `YYYY-MM-DD` values use noon local time so the calendar day matches the stored date.
 */
export function coerceToUiDate(input: string | Date | null | undefined): Date | null {
  if (input == null || input === "") return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }
  const s = input.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format as `DD-MMM-YYYY` (e.g. `15-Apr-2026`). Null/empty/invalid → `—`. */
export function formatUiDate(input: string | Date | null | undefined): string {
  const d = coerceToUiDate(input);
  if (!d) return "—";
  return `${pad2(d.getDate())}-${UI_MONTH_SHORT[d.getMonth()]}-${d.getFullYear()}`;
}

/** Date + short local time, e.g. `15-Apr-2026, 3:45 PM`. Invalid input returns the original string. */
export function formatUiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const timePart = d.toLocaleTimeString("en-US", { timeStyle: "short" });
  return `${formatUiDate(d)}, ${timePart}`;
}
