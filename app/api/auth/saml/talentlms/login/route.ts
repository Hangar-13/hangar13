import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { supabaseSsrAuthCookieSerializeOptions } from "@/lib/supabase-ssr-cookie-options";
import {
  ensureTalentLmsUserAndEnrollInCourse,
  getTalentLmsApiEnrollmentConfig,
} from "@/lib/talentlms/api-enroll";
import { parseTalentLmsCourseAndUnitFromUrl } from "@/lib/talentlms/lesson-url";
import { getTalentLmsSamlEnvironment } from "@/lib/talentlms/saml-config";
import { isTalentLmsSamlDiagnosticLoggingEnabled } from "@/lib/talentlms/saml-diagnostic-logging-flag";
import {
  extractRawUrlQueryWithoutLeadingQuestion,
  parseSamlRedirectBindingQuery,
} from "@/lib/talentlms/saml-redirect-query";
import {
  executeTalentlmsSamlExchange,
  resolveTalentLmsUsername,
  samlResponseAutoPostHtml,
  splitFullName,
} from "@/lib/talentlms/talentlms-saml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Talent course id from the SP-initiated `RelayState` (the lesson deep link Talent
 * wants to return to). Accepts absolute URLs or tenant-relative paths.
 */
function talentCourseIdFromRelayState(
  relayState: string | null | undefined,
  subdomain: string
): string | null {
  const rs = relayState?.trim();
  if (!rs) return null;
  const candidates = [
    rs,
    `https://${subdomain}.talentlms.com${rs.startsWith("/") ? "" : "/"}${rs}`,
  ];
  for (const candidate of candidates) {
    const { courseId } = parseTalentLmsCourseAndUnitFromUrl(candidate);
    if (courseId) return courseId;
  }
  return null;
}

/** base64url(JSON) so non-ASCII emails are safe in HTTP response headers (browser Network tab). */
function buildDiagnosticResponseHeaders(
  payload: Readonly<Record<string, string | undefined>>
): HeadersInit {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  return {
    "X-Hangar-Talent-Saml-Debug": "1",
    "X-Hangar-Talent-Saml-Payload": b64,
  };
}

export async function GET(request: NextRequest) {
  const rawQuery = extractRawUrlQueryWithoutLeadingQuestion(request.url);
  const query = parseSamlRedirectBindingQuery(rawQuery);
  const samlReq = query.SAMLRequest;
  if (!samlReq) {
    return NextResponse.json(
      {
        error:
          "Missing SAMLRequest parameter (Talent LMS must redirect here with SAML 2.0 HTTP-Redirect).",
      },
      { status: 400 }
    );
  }

  if (isTalentLmsSamlDiagnosticLoggingEnabled()) {
    console.warn(
      "[TALENTLMS_SAML_DIAGNOSTIC] IdP route hit on this server:",
      new URL(request.url).href.split("?")[0]
    );
  }

  const forwardQueryParams = query;

  const relayStateRaw = query.RelayState;
  const relayState = relayStateRaw === undefined ? undefined : relayStateRaw;

  try {
    const env = getTalentLmsSamlEnvironment();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabasePublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;
    const cookieStore = await cookies();

    const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
      cookieOptions: supabaseSsrAuthCookieSerializeOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    // Refresh cookie session before getUser() so cross-site hops still see an up-to-date session when possible.
    await supabase.auth.getSession();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL("/auth/login", request.url);
      const redirectTarget =
        rawQuery.length > 0
          ? `${request.nextUrl.pathname}?${rawQuery}`
          : request.nextUrl.pathname;
      loginUrl.searchParams.set("redirect", redirectTarget);
      return isTalentLmsSamlDiagnosticLoggingEnabled()
        ? NextResponse.redirect(loginUrl, {
            headers: buildDiagnosticResponseHeaders({
              stage: "redirect_to_hangar_login",
              reason: "no_supabase_user_on_idp",
              idpUrlHost: new URL(request.url).host,
            }),
          })
        : NextResponse.redirect(loginUrl);
    }

    const { data: profile } = await supabase
      .from("users")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const emailNorm = (profile?.email || user.email || "").trim().toLowerCase();

    if (!emailNorm) {
      return NextResponse.json(
        {
          error:
            "No email on Supabase profile; SSO cannot populate Talent LMS SAML attributes.",
        },
        { status: 400 }
      );
    }

    const { first, last } = splitFullName(profile?.full_name);
    const talentUsername = resolveTalentLmsUsername(emailNorm, env);

    if (isTalentLmsSamlDiagnosticLoggingEnabled()) {
      console.warn(
        "[TALENTLMS_SAML_DIAGNOSTIC] remove TALENTLMS_SAML_DIAGNOSTIC_LOGGING after debugging — asserts PII to logs:",
        JSON.stringify({
          userId: user.id,
          emailSource: profile?.email ? "public.users.email" : "supabase_auth.jwt_email",
          usernameMode: env.usernameMode,
          attrUsernameOid: env.attrUsername,
          attrEmailOid: env.attrEmail,
          emailNormalized: emailNorm,
          samlUsername: talentUsername,
        })
      );
    }

    // Self-healing enrollment: ensure the learner is enrolled in the Talent course
    // they are opening before we issue the assertion. The Talent account is JIT-created
    // here when needed (same login as the SAML `Username` we assert, so Talent matches
    // this exact account), which covers a failed/raced path-time REST enrollment or a
    // brand-new learner whose Talent profile is being provisioned on first SSO.
    const apiConfig = getTalentLmsApiEnrollmentConfig();
    if (apiConfig) {
      const courseId = talentCourseIdFromRelayState(
        relayState,
        apiConfig.subdomain
      );
      if (courseId) {
        const tl = await ensureTalentLmsUserAndEnrollInCourse({
          config: apiConfig,
          userEmail: emailNorm,
          fullName: profile?.full_name,
          courseId,
        });
        if (!tl.ok) {
          console.error(
            "[TalentLMS] SSO-time enroll failed:",
            courseId,
            tl.status,
            tl.message
          );
        }
      }
    }

    const exchanged = await executeTalentlmsSamlExchange({
      env,
      forwardQueryParams,
      normalizedEmailLower: emailNorm,
      talentLmsUsername: talentUsername,
      firstName: first,
      lastName: last,
      relayState,
    });

    const html = samlResponseAutoPostHtml(
      exchanged.entityEndpoint,
      exchanged.encodedResponse,
      relayState
    );

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        ...(isTalentLmsSamlDiagnosticLoggingEnabled()
          ? buildDiagnosticResponseHeaders({
              stage: "saml_auto_post_html",
              emailNormalized: emailNorm,
              samlUsername: talentUsername,
              usernameMode: env.usernameMode,
              attrUsernameOid: env.attrUsername,
              attrEmailOid: env.attrEmail,
            })
          : {}),
      },
    });
  } catch (e) {
    console.error("Talent LMS SAML SSO error:", e);
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === "string"
          ? e
          : "SSO exchange failed.";
    const dev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      {
        error: msg,
        ...(dev ? { detail: e === null || e === undefined ? "" : String(e) } : {}),
      },
      { status: 500 }
    );
  }
}
