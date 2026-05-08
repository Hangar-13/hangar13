import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeRelativeReturn(request: NextRequest, raw: string | null): string {
  const siteOrigin = new URL(request.url).origin;
  if (!raw?.trim()) return "/";
  try {
    const u = new URL(raw.trim(), siteOrigin);
    if (u.origin !== siteOrigin) return "/";
    const pathPart = `${u.pathname}${u.search}`;
    return pathPart.length ? pathPart : "/";
  } catch {
    return "/";
  }
}

export async function GET(request: NextRequest) {
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

  await supabase.auth.signOut({ scope: "global" });

  const next = safeRelativeReturn(
    request,
    request.nextUrl.searchParams.get("ReturnTo") ??
      request.nextUrl.searchParams.get("next")
  );

  return NextResponse.redirect(new URL(next, request.url));
}
