import { isTalentLmsHttpsUrl } from "@/lib/talentlms/lesson-url";

/**
 * Talent LMS SP-initiated SAML entry point (bookmark URL).
 * @see https://help.talentlms.com/hc/en-us/articles/9652216640284-How-to-configure-SSO-with-a-SAML-2-0-identity-provider-in-TalentLMS
 */
const SSO_PATH = "/index/ssologin/service:saml";

/**
 * Browser navigations must hit Talent’s SSO starter URL first; deep lesson URLs skip SAML and show
 * the native Talent password form (learners often have no password when SSO-only).
 *
 * We append `redirect` so Talent may return users to the intended lesson after IdP login.
 * If your portal ignores or rejects this parameter, learners still complete SSO and land on Talent’s
 * default post-login page — remove or adjust with Talent support if needed.
 */
export function talentLmsSpInitiatedSsoLaunchUrl(destinationTalentUrl: string): string {
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

  const originHttps =
    parsed.protocol === "http:"
      ? `https://${parsed.host}`
      : `${parsed.protocol}//${parsed.host}`;

  const sso = new URL(SSO_PATH, `${originHttps}/`);
  sso.searchParams.set("redirect", parsed.href);
  return sso.href;
}
