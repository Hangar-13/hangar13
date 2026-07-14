"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { passwordResetRedirectUrl } from "@/lib/password-reset-redirect-url";

/** Request a password reset email for sign-in / invite recovery (no session required). */
export async function requestPasswordResetEmail(input: {
  email: string;
}): Promise<{ error?: string }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const supabase = await createServerSupabaseClient();
  const redirectTo = await passwordResetRedirectUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}
