/**
 * After password sign-in, send the browser to a URL middleware can finish.
 * `/` is the public landing page, so it is never a post-login destination.
 */
export function postLoginHref(redirectRaw: string | null): string {
  const target = redirectRaw?.trim() ?? "";

  if (!target.startsWith("/") || target.startsWith("//")) {
    return "/auth/continue";
  }

  if (target.startsWith("/api/auth/saml/") || target.includes("SAMLRequest=")) {
    return target;
  }

  if (target.startsWith("/dashboard")) {
    return target;
  }

  return "/auth/continue";
}

export function navigateAfterLogin(redirectRaw: string | null) {
  window.location.assign(postLoginHref(redirectRaw));
}
