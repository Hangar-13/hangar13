/** SCORM 1.2 CMITimespan: HHHH:MM:SS.SS. Returns whole seconds. */
export function parseCmiTimespan(value: string | null | undefined): number {
  if (value == null) return 0;
  const match = /^(\d+):(\d{2}):(\d{2})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59) return 0;
  const fraction = match[4] ? Number(match[4]) / 10 ** match[4].length : 0;
  return Math.round(hours * 3600 + minutes * 60 + seconds + fraction);
}

/** Whole seconds as a SCORM 1.2 CMITimespan. */
export function formatCmiTimespan(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  return `${String(hours).padStart(4, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.00`;
}

/** Prior sittings plus the sitting currently stored on the attempt. */
export function timeSpentSeconds(row: {
  total_time_seconds?: number | null;
  session_time?: string | null;
} | null): number {
  const prior = Number(row?.total_time_seconds ?? 0);
  return (Number.isFinite(prior) ? prior : 0) + parseCmiTimespan(row?.session_time);
}
