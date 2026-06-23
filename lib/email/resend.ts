import "server-only";

import { Resend } from "resend";

/**
 * Lazily-created Resend client. Email is best-effort for beta: if the API key is
 * not configured we return `null` and callers skip sending rather than throwing,
 * so core flows (signup, email confirmation) never break on a missing key.
 */
let resendSingleton: Resend | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }
  resendSingleton ??= new Resend(apiKey);
  return resendSingleton;
}

/** From address for transactional email, e.g. "Hangar 13 <hello@mail.hangar13.app>". */
export function getEmailFromAddress(): string | null {
  return process.env.EMAIL_FROM?.trim() || null;
}
