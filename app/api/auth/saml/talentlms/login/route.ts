import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getTalentLmsSamlEnvironment } from "@/lib/talentlms/saml-config";
import {
  executeTalentlmsSamlExchange,
  resolveTalentLmsUsername,
  samlResponseAutoPostHtml,
  splitFullName,
} from "@/lib/talentlms/talentlms-saml";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const samlReq = request.nextUrl.searchParams.get("SAMLRequest");
  if (!samlReq) {
    return NextResponse.json(
      {
        error:
          "Missing SAMLRequest parameter (Talent LMS must redirect here with SAML 2.0 HTTP-Redirect).",
      },
      { status: 400 }
    );
  }

  const forwardQueryParams: Record<string, string> = {};
  request.nextUrl.searchParams.forEach((value, key) => {
    forwardQueryParams[key] = value;
  });

  const relayStateRaw = request.nextUrl.searchParams.get("RelayState");
  const relayState = relayStateRaw === null ? undefined : relayStateRaw;

  try {
    const env = getTalentLmsSamlEnvironment();

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabasePublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;
    const cookieStore = await cookies();

    const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL("/auth/login", request.url);
      loginUrl.searchParams.set(
        "redirect",
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      return NextResponse.redirect(loginUrl);
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
      },
    });
  } catch (e) {
    console.error("Talent LMS SAML SSO error:", e);
    const msg = e instanceof Error ? e.message : "SSO exchange failed.";
    const dev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      { error: msg, ...(dev ? { detail: `${e}` } : {}) },
      { status: 500 }
    );
  }
}
