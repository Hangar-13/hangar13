import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  hasPlatformAdminAccess,
  highestOrganizationRole,
  normalizeOrganizationRole,
  normalizeSystemRole,
  type OrganizationRole,
  type SystemRole,
} from "@/lib/auth-shared";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";
import { supabaseSsrAuthCookieSerializeOptions } from "@/lib/supabase-ssr-cookie-options";
import { resolveUserStartPath } from "@/lib/user-start-path";

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
    cookieOptions: supabaseSsrAuthCookieSerializeOptions(),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
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

  const isPublicPath =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname === "/join" ||
    isAuthPage;

  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  async function loadUserContext(uid: string): Promise<{
    systemRole: SystemRole;
    lastActiveOrgId: string | null;
    defaultStartPath: string | null;
    memberships: { organization_id: string; role: string }[];
  }> {
    const profile = await fetchSessionUserProfile(supabase);

    const { data: mem } = await supabase
      .from("user_organizations")
      .select("organization_id, role")
      .eq("user_id", uid);

    return {
      systemRole: normalizeSystemRole(profile?.role as string | undefined),
      lastActiveOrgId:
        (profile?.last_active_organization_id as string | undefined) ?? null,
      defaultStartPath: profile?.default_start_path ?? null,
      memberships: mem ?? [],
    };
  }

  function redirectForUserContext(
    systemRole: SystemRole,
    orgRole: OrganizationRole | null,
    defaultStartPath: string | null,
    baseUrl: string
  ) {
    const path = resolveUserStartPath(
      systemRole,
      orgRole,
      defaultStartPath,
      baseUrl
    );
    return NextResponse.redirect(new URL(path, baseUrl));
  }

  /** Prefer the strongest role across orgs so mentors aren’t sent to /student when their active org is student-only. */
  function effectiveOrgRoleForRedirect(
    memberships: { organization_id: string; role: string }[]
  ): OrganizationRole | null {
    if (memberships.length === 0) return null;
    const roles = memberships.map((m) =>
      normalizeOrganizationRole(m.role as string)
    );
    return highestOrganizationRole(roles);
  }

  const isResetPasswordPage =
    request.nextUrl.pathname === "/auth/reset-password";

  const isGodRoute = request.nextUrl.pathname.startsWith("/dashboard/god");
  if (user && isGodRoute) {
    const ctx = await loadUserContext(user.id);
    if (!hasPlatformAdminAccess(ctx.systemRole)) {
      const orgRole = effectiveOrgRoleForRedirect(ctx.memberships);
      return redirectForUserContext(
        ctx.systemRole,
        orgRole,
        ctx.defaultStartPath,
        request.url
      );
    }
  }

  // If no user and trying to access protected route, redirect to login
  if (!user && !isPublicPath && !isApiRoute) {
    const loginUrl = new URL("/auth/login", request.url);
    const resumePath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("redirect", resumePath);
    return NextResponse.redirect(loginUrl);
  }

  // If user is authenticated and on auth pages, redirect to dashboard
  if (user && isAuthPage && !isResetPasswordPage) {
    const ctx = await loadUserContext(user.id);
    const orgRole = effectiveOrgRoleForRedirect(ctx.memberships);
    return redirectForUserContext(
      ctx.systemRole,
      orgRole,
      ctx.defaultStartPath,
      request.url
    );
  }

  // Public marketing home stays public even when signed in, so visitors (and Back
  // from Sign in) can return to `/` instead of being bounced to the dashboard.

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)",
  ],
};
