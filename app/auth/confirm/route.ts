import { type NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { sendWelcomeEmail } from "@/lib/email/welcome-email";
import { parseOptionalOrigin } from "@/lib/talentlms/saml-config";
import { provisionTalentLmsAccountForCurrentUser } from "@/lib/talentlms/provision-account";

/** Only allow same-origin, relative redirect targets to avoid open-redirects. */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/";
  }
  return raw;
}

/**
 * Email confirmation landing route (Supabase SSR token_hash flow).
 *
 * The "Confirm signup" email template must point here, e.g.:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup
 *
 * We verify the OTP (which sets the session cookies), send the one-time welcome
 * email on the first successful email/signup confirmation, then redirect inward.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/auth/login?reason=confirm", request.url));
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    return NextResponse.redirect(new URL("/auth/login?reason=confirm", request.url));
  }

  // Post-confirmation side effects for a self sign-up. All best-effort: a failure
  // here must never block the user from reaching the app.
  if (type === "signup" || type === "email") {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // One-time platform welcome email (claim ensures it's sent exactly once).
    try {
      const { data: claimed } = await supabase.rpc("claim_welcome_email");
      if (claimed === true && user?.email) {
        const origin = parseOptionalOrigin() ?? new URL(request.url).origin;
        await sendWelcomeEmail({
          to: user.email,
          fullName: (user?.user_metadata?.full_name as string | undefined) ?? null,
          origin,
        });
      }
    } catch {
      // Swallow — confirmation already succeeded.
    }

    // Provision the learner's TalentLMS account now, so it exists before any
    // training-path enrollment. Failures are recorded on the user row and surfaced
    // via a dashboard banner with a "Try again" action.
    if (user) {
      try {
        const { data: profile } = await supabase
          .from("users")
          .select("email, full_name")
          .eq("id", user.id)
          .maybeSingle();
        await provisionTalentLmsAccountForCurrentUser({
          supabase,
          email: profile?.email || user.email,
          fullName:
            profile?.full_name ??
            (user.user_metadata?.full_name as string | undefined) ??
            null,
        });
      } catch {
        // Swallow — confirmation already succeeded.
      }
    }
  }

  return NextResponse.redirect(new URL(next, request.url));
}
