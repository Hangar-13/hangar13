import "server-only";

import { headers } from "next/headers";

import { parseOptionalOrigin } from "@/lib/talentlms/saml-config";

/** Absolute URL Supabase should redirect to after a password-recovery link is opened. */
export async function passwordResetRedirectUrl(): Promise<string> {
  const configured = parseOptionalOrigin();
  if (configured) {
    return `${configured}/auth/reset-password`;
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") ?? "https";
  return host ? `${protocol}://${host}/auth/reset-password` : "/auth/reset-password";
}
