/** ACS coverage grid colors — matches AtaChapterCoverage (acs mode). */
export function acsCoverageCellClasses(
  satisfied: number,
  total: number,
  options?: { selected?: boolean }
): string {
  let bg: string;
  if (satisfied === 0) bg = "bg-[#F5F0E8] text-gray-400";
  else if (total > 0 && satisfied < total) bg = "bg-[#CC5A2A] text-white";
  else bg = "bg-green-500 text-white";

  const ring = options?.selected
    ? "ring-2 ring-primary ring-offset-1 ring-offset-background"
    : "border border-gray-300";

  return `${bg} ${ring}`;
}
