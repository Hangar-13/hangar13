import type { SerializeOptions } from "cookie";

/**
 * Supabase SSR packages auth into browser cookies (@supabase/ssr defaults SameSite=Lax).
 *
 * **Production HTTPS:** use **`SameSite=None`** + **`Secure`** so a cross-site return still carries the session.
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
