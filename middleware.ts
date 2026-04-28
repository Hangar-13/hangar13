import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  hasPlatformAdminAccess,
  normalizeSystemRole,
  type SystemRole,
} from "@/lib/auth-shared";

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

  const isGodRoute = request.nextUrl.pathname.startsWith("/dashboard/god");
  if (user && isGodRoute) {
    const role = await systemRoleForUser(user.id);
    if (!hasPlatformAdminAccess(role)) {
      return NextResponse.redirect(new URL("/dashboard/mentor", request.url));
    }
  }

  // If no user and trying to access protected route, redirect to login
  if (!user && !isPublicPath) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  async function systemRoleForUser(uid: string): Promise<SystemRole> {
    const { data: row } = await supabase
      .from("users")
      .select("role")
      .eq("id", uid)
      .maybeSingle();
    return normalizeSystemRole(row?.role as string | undefined);
  }

  function redirectForSystemRole(role: SystemRole, baseUrl: string) {
    if (role === "guest" || role === "student") {
      return NextResponse.redirect(new URL("/dashboard/student", baseUrl));
    }
    if (role === "manager") {
      return NextResponse.redirect(new URL("/dashboard/manager", baseUrl));
    }
    if (role === "admin" || role === "god") {
      return NextResponse.redirect(new URL("/dashboard/god", baseUrl));
    }
    if (role === "mentor") {
      return NextResponse.redirect(new URL("/dashboard/mentor", baseUrl));
    }
    return NextResponse.redirect(new URL("/", baseUrl));
  }

  // If user is authenticated and on auth pages, redirect to dashboard
  if (user && isAuthPage) {
    const role = await systemRoleForUser(user.id);
    return redirectForSystemRole(role, request.url);
  }

  // If user is authenticated and on root path, redirect based on role
  if (user && request.nextUrl.pathname === "/") {
    const role = await systemRoleForUser(user.id);
    return redirectForSystemRole(role, request.url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
