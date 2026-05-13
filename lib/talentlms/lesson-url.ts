/** URL points at any *.talentlms.com host (including www / apex). */
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

/** Tenant learner portal — excludes www.talentlms.com and talentlms.com (marketing hosts). */
export function isTalentLmsTenantPortalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "talentlms.com" || h === "www.talentlms.com") return false;
  return h.endsWith(".talentlms.com");
}
