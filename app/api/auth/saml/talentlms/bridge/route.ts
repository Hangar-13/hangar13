import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { supabaseSsrAuthCookieSerializeOptions } from "@/lib/supabase-ssr-cookie-options";
import { isTalentLmsTenantPortalHttpsUrl } from "@/lib/talentlms/lesson-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Same-origin hop before opening Talent in another tab/site.
 * Ensures Hangar can read/refresh the Supabase session while cookies are sent
 * (`sec-fetch-site: same-origin`), then redirects to the Talent lesson URL.
 */
export async function GET(request: NextRequest) {
  const toRaw = request.nextUrl.searchParams.get("to")?.trim();
  if (!toRaw || !isTalentLmsTenantPortalHttpsUrl(toRaw)) {
    return NextResponse.json(
      { error: "Missing or invalid `to` (must be an https Talent LMS tenant lesson URL)." },
      { status: 400 }
    );
  }

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

  await supabase.auth.getSession();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    const bridgeResume = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("redirect", bridgeResume);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.redirect(toRaw);
}
