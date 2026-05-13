/** Hostname is a TalentLMS subdomain (e.g. myorg.talentlms.com). */
export function isTalentLmsHttpsUrl(href: string): boolean {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "talentlms.com" || host.endsWith(".talentlms.com");
  } catch {
    return false;
  }
}

/**
 * Picks the first plausible Talent LMS URL embedded in markdown (linked or raw).
 * Used as a canonical "start this week's Talent lesson" target when Hangar manages copy in markdown.
 */
export function extractFirstTalentLmsUrlFromMarkdown(markdown: string): string | null {
  if (!markdown.trim()) return null;

  const mdLinkPattern =
    /\]\(\s*(https?:\/\/[^)\s]+\.talentlms\.com[^)\s]*)\s*\)/gi;
  let m = mdLinkPattern.exec(markdown);
  if (m?.[1]) {
    try {
      return new URL(sanitizeMarkdownUrlTail(m[1])).href;
    } catch {
      /* fall through */
    }
  }

  const rawPattern = /https?:\/\/[^\s\]"'`<>()]+\.talentlms\.com[^\s\]"'`<>()]*/gi;
  m = rawPattern.exec(markdown);
  while (m) {
    try {
      return new URL(sanitizeMarkdownUrlTail(m[0])).href;
    } catch {
      /* try next occurrence */
    }
    m = rawPattern.exec(markdown);
  }

  return null;
}

/** Trims stray markdown / punctuation from the end of a captured URL fragment. */
function sanitizeMarkdownUrlTail(s: string): string {
  return s.replace(/[.,;]+$/, "").replace(/\)+$/, "");
}
