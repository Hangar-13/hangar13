import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  defaultDashboardPathForOrgRole,
  hasPlatformAdminAccess,
  highestOrganizationRole,
  normalizeOrganizationRole,
  normalizeSystemRole,
  type OrganizationRole,
  type SystemRole,
} from "@/lib/auth-shared";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";

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
  const isTalentLmsSamlApi = request.nextUrl.pathname.startsWith(
    "/api/auth/saml/talentlms/"
  );

  /** Talent LMS SSO entry + metadata may be fetched without login; SAML login route redirects anon users */
  const isPublicPath =
    request.nextUrl.pathname === "/" ||
    isAuthPage ||
    isTalentLmsSamlApi;

  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");

  async function loadUserContext(uid: string): Promise<{
    systemRole: SystemRole;
    lastActiveOrgId: string | null;
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
      memberships: mem ?? [],
    };
  }

  function redirectForUserContext(
    systemRole: SystemRole,
    orgRole: OrganizationRole | null,
    baseUrl: string
  ) {
    if (hasPlatformAdminAccess(systemRole)) {
      return NextResponse.redirect(new URL("/dashboard/god", baseUrl));
    }
    const path = defaultDashboardPathForOrgRole(orgRole);
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

  const isGodRoute = request.nextUrl.pathname.startsWith("/dashboard/god");
  if (user && isGodRoute) {
    const ctx = await loadUserContext(user.id);
    if (!hasPlatformAdminAccess(ctx.systemRole)) {
      const orgRole = effectiveOrgRoleForRedirect(ctx.memberships);
      return redirectForUserContext(ctx.systemRole, orgRole, request.url);
    }
  }

  // If no user and trying to access protected route, redirect to login
  if (!user && !isPublicPath && !isApiRoute) {
    const loginUrl = new URL("/auth/login", request.url);
    loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user is authenticated and on auth pages, redirect to dashboard
  if (user && isAuthPage) {
    const ctx = await loadUserContext(user.id);
    const orgRole = effectiveOrgRoleForRedirect(ctx.memberships);
    return redirectForUserContext(ctx.systemRole, orgRole, request.url);
  }

  // If user is authenticated and on root path, redirect based on role + org memberships
  if (user && request.nextUrl.pathname === "/") {
    const ctx = await loadUserContext(user.id);
    const orgRole = effectiveOrgRoleForRedirect(ctx.memberships);
    return redirectForUserContext(ctx.systemRole, orgRole, request.url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
