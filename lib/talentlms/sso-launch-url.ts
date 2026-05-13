import {
  isTalentLmsHttpsUrl,
  isTalentLmsTenantPortalHostname,
} from "@/lib/talentlms/lesson-url";

/**
 * Talent LMS SP-initiated SAML entry point (bookmark URL).
 * @see https://help.talentlms.com/hc/en-us/articles/9652216640284-How-to-configure-SSO-with-a-SAML-2-0-identity-provider-in-TalentLMS
 */
const SSO_PATH = "/index/ssologin/service:saml";

/**
 * Browser navigations must hit Talent’s SSO starter URL on your **tenant** host first.
 * Using `www.talentlms.com` or apex `talentlms.com` for SSO lands on marketing / wrong site.
 *
 * Optional `portalOrigin` should match SAML (`TALENTLMS_SUBDOMAIN`), e.g. `https://myorg.talentlms.com`.
 */
export function talentLmsSpInitiatedSsoLaunchUrl(
  destinationTalentUrl: string,
  options?: Readonly<{ portalOrigin?: string | null }>
): string {
  const trimmed = destinationTalentUrl.trim();
  if (!trimmed || !isTalentLmsHttpsUrl(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const pathnameLower = parsed.pathname.toLowerCase();
  if (pathnameLower.includes("/index/ssologin/")) {
    return parsed.href;
  }

  const tenantPortal = isTalentLmsTenantPortalHostname(parsed.hostname);
  const portalOriginNorm = normalizeTalentPortalOrigin(options?.portalOrigin);

  let ssoOrigin: string | null = null;
  if (tenantPortal) {
    ssoOrigin =
      parsed.protocol === "http:"
        ? `https://${parsed.host}`
        : `${parsed.protocol}//${parsed.host}`;
  } else if (portalOriginNorm) {
    ssoOrigin = portalOriginNorm;
  }

  if (!ssoOrigin) {
    return trimmed;
  }

  const sso = new URL(SSO_PATH, `${ssoOrigin}/`);

  if (tenantPortal) {
    sso.searchParams.set("redirect", parsed.href);
  } else if (portalOriginNorm) {
    sso.searchParams.set("redirect", `${portalOriginNorm}/`);
  }

  return sso.href;
}

function normalizeTalentPortalOrigin(raw: string | null | undefined): string | null {
  const t = raw?.trim().replace(/\/$/, "") ?? "";
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (!isTalentLmsTenantPortalHostname(u.hostname)) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}
