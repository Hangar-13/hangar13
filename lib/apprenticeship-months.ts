/** Calendar-month apprenticeship progress. The day of the month is ignored. */

export type ApprenticeshipBreakRange = {
  startedOn: string;
  endedOn: string | null;
};

function monthIndex(isoDate: string): number {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate);
  if (!match) return NaN;
  return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

/** Whole calendar months from the start month up to, but not including, the end month. */
export function calendarMonthsBetween(startIso: string, endIso: string): number {
  const start = monthIndex(startIso);
  const end = monthIndex(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/** Inclusive calendar months covered by breaks, merged so overlaps count once. */
export function breakMonthsThrough(
  breaks: ApprenticeshipBreakRange[],
  asOfIso: string,
  apprenticeshipStartedOn: string
): number {
  const asOf = monthIndex(asOfIso);
  const programStart = monthIndex(apprenticeshipStartedOn);
  if (!Number.isFinite(asOf) || !Number.isFinite(programStart)) return 0;

  const ranges = breaks
    .map((item) => {
      const start = Math.max(monthIndex(item.startedOn), programStart);
      const rawEnd = item.endedOn ? monthIndex(item.endedOn) : asOf;
      const end = Math.min(rawEnd, asOf);
      return [start, end] as const;
    })
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end >= start)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let current: [number, number] | null = null;
  for (const range of ranges) {
    if (!current) {
      current = [range[0], range[1]];
      continue;
    }
    if (range[0] <= current[1] + 1) {
      current = [current[0], Math.max(current[1], range[1])];
    } else {
      total += current[1] - current[0] + 1;
      current = [range[0], range[1]];
    }
  }
  if (current) total += current[1] - current[0] + 1;
  return total;
}

export function completedApprenticeshipMonths(input: {
  startedOn: string;
  breaks: ApprenticeshipBreakRange[];
  asOfIso: string;
}): number {
  const elapsed = calendarMonthsBetween(input.startedOn, input.asOfIso);
  const away = breakMonthsThrough(input.breaks, input.asOfIso, input.startedOn);
  return Math.max(0, elapsed - away);
}

/** Store a month input (`YYYY-MM` or `YYYY-MM-DD`) as the first of that month. */
export function monthInputToDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

export function dateToMonthInput(value: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(value ?? "");
  return match ? `${match[1]}-${match[2]}` : "";
}
