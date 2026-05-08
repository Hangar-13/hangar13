import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrganizationRole } from "@/lib/auth-shared";
import {
  hasOrganizationRolePermission,
  normalizeOrganizationRole,
} from "@/lib/auth-shared";

/** Role in a specific org; missing membership => student (no elevated org access). */
export async function getUserRoleInOrganization(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string
): Promise<OrganizationRole> {
  const { data } = await supabase
    .from("user_organizations")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  return normalizeOrganizationRole(data?.role as string | undefined);
}

export async function hasOrgRoleAtLeast(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  minRole: OrganizationRole
): Promise<boolean> {
  const r = await getUserRoleInOrganization(supabase, userId, organizationId);
  return hasOrganizationRolePermission(r, minRole);
}

export async function listOrganizationIdsWhereUserHasMinRole(
  supabase: SupabaseClient,
  userId: string,
  minRole: OrganizationRole
): Promise<string[]> {
  const { data: rows } = await supabase
    .from("user_organizations")
    .select("organization_id, role")
    .eq("user_id", userId);

  const out: string[] = [];
  for (const row of rows ?? []) {
    const r = normalizeOrganizationRole(row.role as string);
    if (hasOrganizationRolePermission(r, minRole)) {
      out.push(row.organization_id as string);
    }
  }
  return out;
}

/**
 * Owning org for new catalog rows: prefer an org where the user is manager/supervisor,
 * else any membership, else earliest org in the system.
 */
export async function resolveOrganizationIdForCreatedContent(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data: elevated } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId)
    .in("role", ["manager", "supervisor"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (elevated?.organization_id) {
    return elevated.organization_id;
  }

  const { data: membership } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.organization_id) {
    return membership.organization_id;
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return org?.id ?? null;
}
