import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

  if (!supabaseUrl || !supabasePublishableKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthPage = request.nextUrl.pathname.startsWith("/auth");
  const isPublicPath = request.nextUrl.pathname === "/" || isAuthPage;

  // If no user and trying to access protected route, redirect to login
  if (!user && !isPublicPath) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user is authenticated and on auth pages, redirect to dashboard
  if (user && isAuthPage) {
    // Get role from profile (JWT metadata may not be up to date)
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role || user.user_metadata?.role;

    if (role === "apprentice") {
      return NextResponse.redirect(new URL("/dashboard/apprentice", request.url));
    } else if (role === "mentor" || role === "manager" || role === "god") {
      // Managers and gods can access mentor dashboard (they have all mentor permissions)
      // TODO: Add specific manager/god dashboards later
      return NextResponse.redirect(new URL("/dashboard/mentor", request.url));
    }
    // Default to root dashboard if no role
    return NextResponse.redirect(new URL("/", request.url));
  }

  // If user is authenticated and on root path, redirect based on role
  if (user && request.nextUrl.pathname === "/") {
    // Get role from profile (more reliable than JWT metadata)
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role || user.user_metadata?.role;

    if (role === "apprentice") {
      return NextResponse.redirect(new URL("/dashboard/apprentice", request.url));
    } else if (role === "mentor" || role === "manager" || role === "god") {
      // Managers and gods can access mentor dashboard (they have all mentor permissions)
      // TODO: Add specific manager/god dashboards later
      return NextResponse.redirect(new URL("/dashboard/mentor", request.url));
    }
    // If no role set, allow access to root (which will show dashboard)
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

