import type { SerializeOptions } from "cookie";

/**
 * Supabase SSR packages auth into browser cookies (@supabase/ssr defaults SameSite=Lax).
 * Talent LMS (and similar SPs) redirects the learner **cross-site** into Hangar’s SAML IdP URL.
 * In some browsers/versions, **Lax** session cookies are not attached on that hop, so Hangar incorrectly
 * treats the learner as logged out (`/auth/login`) even though the training tab session is fine.
 *
 * **Production HTTPS:** use **`SameSite=None`** + **`Secure`** so the SSO redirect carries the cookie.
 *
 * **Local dev (HTTP):** keep **Lax** — **None + Secure** cannot be set reliably without HTTPS.
 */
export function supabaseSsrAuthCookieSerializeOptions(): SerializeOptions {
  if (process.env.NODE_ENV === "production") {
    return {
      path: "/",
      sameSite: "none",
      secure: true,
    };
  }

  return {
    path: "/",
    sameSite: "lax",
    secure: false,
  };
}

/** Browser client cookie serializer must mirror server attrs or refreshes churn cookies oddly. */
export function supabaseBrowserAuthCookieSerializeOptions(): SerializeOptions {
  if (
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    process.env.NODE_ENV === "production"
  ) {
    return {
      path: "/",
      sameSite: "none",
      secure: true,
    };
  }

  if (typeof window !== "undefined") {
    return {
      path: "/",
      sameSite: "lax",
      secure: window.location.protocol === "https:",
    };
  }

  return {
    path: "/",
    sameSite: "lax",
    secure: false,
  };
}
