/** Cookie used by middleware and server actions for active org context. */
export const ACTIVE_ORGANIZATION_COOKIE = "hangar_active_organization_id";

export type OrgMembership = {
  organization_id: string;
  role: string;
};

export function resolveActiveOrganizationId(
  memberships: OrgMembership[],
  cookieOrgId: string | null | undefined,
  lastUsedOrgId: string | null | undefined
): string | null {
  if (memberships.length === 0) {
    return null;
  }
  const valid = new Set(memberships.map((m) => m.organization_id));
  if (cookieOrgId && valid.has(cookieOrgId)) {
    return cookieOrgId;
  }
  if (lastUsedOrgId && valid.has(lastUsedOrgId)) {
    return lastUsedOrgId;
  }
  if (memberships.length === 1) {
    return memberships[0]!.organization_id;
  }
  return memberships[0]!.organization_id;
}
