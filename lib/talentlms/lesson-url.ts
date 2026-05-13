/** URL points at any *.talentlms.com host (including www / apex marketing domains). */
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

/** Learner portal host — excludes www.talentlms.com and talentlms.com (marketing / broken SSO entry). */
export function isTalentLmsTenantPortalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "talentlms.com" || h === "www.talentlms.com") return false;
  return h.endsWith(".talentlms.com");
}

export function isTalentLmsTenantPortalHttpsUrl(href: string): boolean {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return isTalentLmsTenantPortalHostname(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Picks the first plausible Talent LMS URL embedded in markdown (linked or raw).
 * Prefers tenant portal URLs (`yourschool.talentlms.com`) over `www.talentlms.com` / apex links.
 */
export function extractFirstTalentLmsUrlFromMarkdown(markdown: string): string | null {
  if (!markdown.trim()) return null;

  const candidates: string[] = [];

  const mdLinkPattern =
    /\]\(\s*(https?:\/\/[^)\s]+\.talentlms\.com[^)\s]*)\s*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = mdLinkPattern.exec(markdown)) !== null) {
    pushTalentCandidate(candidates, sanitizeMarkdownUrlTail(m[1]));
  }

  const rawPattern = /https?:\/\/[^\s\]"'`<>()]+\.talentlms\.com[^\s\]"'`<>()]*/gi;
  while ((m = rawPattern.exec(markdown)) !== null) {
    pushTalentCandidate(candidates, sanitizeMarkdownUrlTail(m[0]));
  }

  const tenantHit = candidates.find((c) => isTalentLmsTenantPortalHttpsUrl(c));
  return tenantHit ?? candidates[0] ?? null;
}

function pushTalentCandidate(bucket: string[], raw: string): void {
  if (!raw.trim()) return;
  try {
    bucket.push(new URL(raw).href);
  } catch {
    /* skip invalid */
  }
}

/** Trims stray markdown / punctuation from the end of a captured URL fragment. */
function sanitizeMarkdownUrlTail(s: string): string {
  return s.replace(/[.,;]+$/, "").replace(/\)+$/, "");
}
