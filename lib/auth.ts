import { createServerSupabaseClient } from "./supabase-server";

export type UserRole = "apprentice" | "mentor" | "manager" | "god";

export interface ActiveUser {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string;
}

/**
 * Role hierarchy constants
 * Higher roles inherit permissions from lower roles
 */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  apprentice: 1,
  mentor: 2,
  manager: 3,
  god: 4,
};

/**
 * Check if a role has at least the permissions of another role
 * Higher roles can do everything lower roles can do
 */
export function hasRolePermission(
  userRole: UserRole,
  requiredRole: UserRole
): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Check if a role can manage (upgrade/downgrade) another role
 * - Managers and gods can manage apprentices and mentors
 * - Only gods can manage managers
 * - No one can manage gods (except possibly other gods in future)
 */
export function canManageRole(
  managerRole: UserRole,
  targetRole: UserRole
): boolean {
  if (targetRole === "god") {
    // Only gods can manage other gods (or no one, depending on requirements)
    return managerRole === "god";
  }
  if (targetRole === "manager") {
    // Only gods can manage managers
    return managerRole === "god";
  }
  // Managers and gods can manage apprentices and mentors
  return managerRole === "manager" || managerRole === "god";
}

/**
 * Get the currently authenticated user with their role
 * Returns null if no user is authenticated
 * This automatically uses the JWT from the request cookies
 */
export async function getActiveUser(): Promise<ActiveUser | null> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Get role from profile (more reliable than JWT metadata)
  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return null;
  }

  return {
    id: user.id,
    email: profile.email || user.email || "",
    role: (profile.role as UserRole) || "apprentice",
    full_name: profile.full_name || undefined,
  };
}

/**
 * Require authentication - throws redirect if no user
 * Use this in server components that require authentication
 */
export async function requireAuth(): Promise<ActiveUser> {
  const user = await getActiveUser();

  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/auth/login");
  }

  return user as ActiveUser; // Type assertion safe because redirect throws if user is null
}
