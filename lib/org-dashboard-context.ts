import { cookies } from "next/headers";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  resolveActiveOrganizationId,
} from "@/lib/active-organization";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  normalizeOrganizationRole,
  type OrganizationRole,
} from "@/lib/auth-shared";

export type ActiveOrgDashboardContext = {
  organizationId: string;
  organizationName: string;
  organizationRole: OrganizationRole;
};

/**
 * Active organization from cookie + profile + memberships (same resolution as middleware / nav API).
 */
export async function getActiveOrgDashboardContext(): Promise<ActiveOrgDashboardContext | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const cookieStore = await cookies();
  const cookieOrg = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;

  const { data: profile } = await supabase
    .from("users")
    .select("last_active_organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memRows } = await supabase
    .from("user_organizations")
    .select("organization_id, role")
    .eq("user_id", user.id);

  const flat = (memRows ?? []).map((r) => ({
    organization_id: r.organization_id as string,
    role: r.role as string,
  }));

  const activeId = resolveActiveOrganizationId(
    flat,
    cookieOrg,
    profile?.last_active_organization_id as string | undefined
  );
  if (!activeId) {
    return null;
  }

  const roleRaw = memRows?.find((m) => m.organization_id === activeId)?.role;
  const organizationRole = normalizeOrganizationRole(roleRaw as string);

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", activeId)
    .maybeSingle();

  return {
    organizationId: activeId,
    organizationName: (org?.name as string) ?? "Organization",
    organizationRole,
  };
}
