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

/** Month and year only, `MMM-YYYY` (e.g. `Apr-2026`). `month` is 1–12. */
export function formatUiMonthYear(year: number, month: number): string {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return "—";
  }
  return `${UI_MONTH_SHORT[month - 1]}-${year}`;
}

const UI_MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function isRealCalendarDate(year: number, monthIndex: number, day: number): boolean {
  const date = new Date(year, monthIndex, day);
  return (
    date.getFullYear() === year && date.getMonth() === monthIndex && date.getDate() === day
  );
}

/**
 * Parse a displayed aviation date into `YYYY-MM-DD`.
 * Accepts `DD-MMM-YYYY` and an ISO date. Empty input returns `""`. Invalid input returns null.
 */
export function parseUiDateToIso(input: string): string | null {
  const value = input.trim();
  if (!value) return "";

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || !isRealCalendarDate(year, month - 1, day)) return null;
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const aviation = /^(\d{1,2})[-\s/]([A-Za-z]{3})[-\s/](\d{4})$/.exec(value);
  if (!aviation) return null;
  const day = Number(aviation[1]);
  const monthIndex = UI_MONTH_INDEX[aviation[2].toLowerCase()];
  const year = Number(aviation[3]);
  if (monthIndex == null || !isRealCalendarDate(year, monthIndex, day)) return null;
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/** Date + short local time, e.g. `15-Apr-2026, 3:45 PM`. Invalid input returns the original string. */
export function formatUiDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const timePart = d.toLocaleTimeString("en-US", { timeStyle: "short" });
  return `${formatUiDate(d)}, ${timePart}`;
}
