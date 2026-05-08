/** Client-safe types and helpers. System roles ≠ organization roles. */

/** Platform-wide role (`public.users.role`). */
export type SystemRole = "guest" | "standard" | "admin" | "god";

/** Role within one organization (`public.user_organizations.role`). */
export type OrganizationRole =
  | "student"
  | "mentor"
  | "manager"
  | "supervisor"
  | "lead";

/** @deprecated Use `SystemRole`; kept for gradual rename in call sites. */
export type UserRole = SystemRole;

export interface ActiveUser {
  id: string;
  email: string;
  role: SystemRole;
  full_name?: string;
}

export const SYSTEM_ROLE_HIERARCHY: Record<SystemRole, number> = {
  guest: 0,
  standard: 1,
  admin: 2,
  god: 3,
};

export const ORGANIZATION_ROLE_HIERARCHY: Record<OrganizationRole, number> = {
  student: 1,
  mentor: 2,
  manager: 3,
  supervisor: 4,
  lead: 5,
};

export function hasSystemRolePermission(
  userRole: SystemRole,
  requiredRole: SystemRole
): boolean {
  return SYSTEM_ROLE_HIERARCHY[userRole] >= SYSTEM_ROLE_HIERARCHY[requiredRole];
}

/** System roles that can open platform admin (Users, Organizations) and super routes. */
export function hasPlatformAdminAccess(role: SystemRole): boolean {
  return role === "admin" || role === "god";
}

/** Authenticated non-guest accounts (normal users). */
export function isStandardOrElevated(role: SystemRole): boolean {
  return role === "standard" || hasPlatformAdminAccess(role);
}

/** @deprecated Use `hasSystemRolePermission`. */
export function hasRolePermission(
  userRole: SystemRole,
  requiredRole: SystemRole
): boolean {
  return hasSystemRolePermission(userRole, requiredRole);
}

export function hasOrganizationRolePermission(
  userRole: OrganizationRole,
  requiredRole: OrganizationRole
): boolean {
  return (
    ORGANIZATION_ROLE_HIERARCHY[userRole] >=
    ORGANIZATION_ROLE_HIERARCHY[requiredRole]
  );
}

export function normalizeSystemRole(
  value: string | null | undefined
): SystemRole {
  if (
    value === "guest" ||
    value === "standard" ||
    value === "admin" ||
    value === "god"
  ) {
    return value;
  }
  /* Legacy rows / cached values */
  if (
    value === "student" ||
    value === "mentor" ||
    value === "manager"
  ) {
    return "standard";
  }
  return "standard";
}

export function normalizeOrganizationRole(
  value: string | null | undefined
): OrganizationRole {
  if (
    value === "student" ||
    value === "mentor" ||
    value === "manager" ||
    value === "supervisor" ||
    value === "lead"
  ) {
    return value;
  }
  if (value === "admin" || value === "god") {
    return "supervisor";
  }
  return "student";
}

/** @deprecated Use `normalizeSystemRole` for users.role or `normalizeOrganizationRole` for memberships. */
export function normalizeUserRole(value: string | null | undefined): SystemRole {
  return normalizeSystemRole(value);
}

/** Max organization role from a list; empty => student. */
export function highestOrganizationRole(
  roles: OrganizationRole[]
): OrganizationRole {
  if (roles.length === 0) {
    return "student";
  }
  return roles.reduce((a, b) =>
    ORGANIZATION_ROLE_HIERARCHY[a] >= ORGANIZATION_ROLE_HIERARCHY[b] ? a : b
  );
}

/** @deprecated Use `highestOrganizationRole` for org membership lists only. */
export function highestUserRole(roles: SystemRole[]): SystemRole {
  if (roles.length === 0) {
    return "standard";
  }
  return roles.reduce((a, b) =>
    SYSTEM_ROLE_HIERARCHY[a] >= SYSTEM_ROLE_HIERARCHY[b] ? a : b
  );
}

/**
 * Who may change another user's **system** role (god UI).
 */
export function canManageRole(
  managerRole: SystemRole,
  targetRole: SystemRole
): boolean {
  if (managerRole !== "god" && managerRole !== "admin") {
    return false;
  }
  if (managerRole === "god") {
    return true;
  }
  /* Admin may manage any non-god role (including other admins); gods are god-only. */
  return targetRole !== "god";
}

/** Default dashboard path from org role (active organization). */
export function defaultDashboardPathForOrgRole(
  orgRole: OrganizationRole | null
): string {
  if (!orgRole) {
    return "/dashboard/student";
  }
  if (orgRole === "supervisor" || orgRole === "lead") {
    return "/dashboard/organization";
  }
  if (hasOrganizationRolePermission(orgRole, "manager")) {
    return "/dashboard/manager";
  }
  if (hasOrganizationRolePermission(orgRole, "mentor")) {
    return "/dashboard/mentor";
  }
  return "/dashboard/student";
}
