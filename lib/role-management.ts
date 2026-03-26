import { createServerSupabaseClient } from "./supabase-server";
import { UserRole, canManageRole } from "./auth";

/**
 * Update a user's role
 * Only users with appropriate permissions can change roles:
 * - Managers and gods can upgrade/downgrade apprentices and mentors
 * - Only gods can upgrade/downgrade managers
 */
export async function updateUserRole(
  targetUserId: string,
  newRole: UserRole,
  managerUserId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();

  // Get the manager's role
  const { data: managerProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", managerUserId)
    .single();

  if (!managerProfile) {
    return { success: false, error: "Manager profile not found" };
  }

  const managerRole = managerProfile.role as UserRole;

  // Get the target user's current role
  const { data: targetProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", targetUserId)
    .single();

  if (!targetProfile) {
    return { success: false, error: "Target user not found" };
  }

  const currentRole = targetProfile.role as UserRole;

  // Check if manager can manage this role change
  if (!canManageRole(managerRole, currentRole)) {
    return {
      success: false,
      error: `You do not have permission to change the role of ${currentRole} users`,
    };
  }

  // Check if manager can set the new role
  if (!canManageRole(managerRole, newRole)) {
    return {
      success: false,
      error: `You do not have permission to set role to ${newRole}`,
    };
  }

  // Prevent downgrading gods (except other gods)
  if (currentRole === "god" && managerRole !== "god") {
    return {
      success: false,
      error: "Only god users can modify other god users",
    };
  }

  // Update the role
  const { error: updateError } = await supabase
    .from("users")
    .update({ role: newRole })
    .eq("id", targetUserId);

  if (updateError) {
    return {
      success: false,
      error: `Failed to update role: ${updateError.message}`,
    };
  }

  // Update user metadata in auth.users for JWT consistency
  // Note: This requires admin access, so it may not work with RLS
  // The profile update above is the source of truth

  return { success: true };
}

/**
 * Get all users that the current user can manage
 */
export async function getManageableUsers(userId: string): Promise<
  Array<{
    id: string;
    email: string;
    full_name: string | null;
    role: UserRole;
  }>
> {
  const supabase = await createServerSupabaseClient();

  // Get the current user's role
  const { data: userProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (!userProfile) {
    return [];
  }

  const userRole = userProfile.role as UserRole;

  // Determine which roles this user can manage
  let manageableRoles: UserRole[] = [];
  if (userRole === "manager" || userRole === "god") {
    manageableRoles = ["apprentice", "mentor"];
  }
  if (userRole === "god") {
    manageableRoles = ["apprentice", "mentor", "manager"];
  }

  if (manageableRoles.length === 0) {
    return [];
  }

  // Get all users with manageable roles
  const { data: profiles } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .in("role", manageableRoles);

  return (
    profiles?.map((profile) => ({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role as UserRole,
    })) || []
  );
}
