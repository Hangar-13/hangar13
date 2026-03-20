/** ACS domain for chapter-to-domain mapping */
export type AcsDomain = "general" | "airframe" | "powerplant";

/** Normalize chapter number to two digits (e.g. "9" -> "09") */
export function normalizeChapterNumber(ch: string | number | null | undefined): string {
  const s = String(ch ?? "").trim();
  if (s.length === 1 && /^\d$/.test(s)) return "0" + s;
  return s;
}

/** Map ATA chapter number to ACS domain */
export function getDomainForAtaChapter(
  chapterNumber: string | number | null | undefined
): AcsDomain {
  const s = String(chapterNumber ?? "").trim();
  const n = parseInt(s, 10);
  if (s === "" || isNaN(n)) return "general";
  if (n >= 71 && n <= 85) return "powerplant";
  if (n >= 20 && n <= 57) return "airframe";
  return "general";
}
