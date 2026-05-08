import { createServerSupabaseClient } from "./supabase-server";
import { createAdminSupabaseClient } from "./supabase-admin";
import { type SystemRole, canManageRole, normalizeSystemRole } from "./auth-shared";

/**
 * Updates the target user's **system** role (`public.users.role` only).
 * Organization memberships are unchanged; manage those separately.
 */
export async function updateUserRole(
  targetUserId: string,
  newRole: SystemRole,
  managerUserId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createServerSupabaseClient();

  const newRoleNorm = normalizeSystemRole(newRole);

  const { data: managerProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", managerUserId)
    .single();

  if (!managerProfile) {
    return { success: false, error: "Manager profile not found" };
  }

  const managerRole = normalizeSystemRole(managerProfile.role as string);

  const { data: targetProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", targetUserId)
    .single();

  if (!targetProfile) {
    return { success: false, error: "Target user not found" };
  }

  const currentRole = normalizeSystemRole(targetProfile.role as string);

  if (managerUserId === targetUserId && managerRole !== "god") {
    return {
      success: false,
      error: "You cannot change your own role.",
    };
  }

  if (!canManageRole(managerRole, currentRole)) {
    return {
      success: false,
      error: `You do not have permission to change the role of ${currentRole} users`,
    };
  }

  if (!canManageRole(managerRole, newRoleNorm)) {
    return {
      success: false,
      error: `You do not have permission to set role to ${newRoleNorm}`,
    };
  }

  if (newRoleNorm === "god" || newRoleNorm === "admin") {
    const { error: updateError } = await supabase
      .from("users")
      .update({
        role: newRoleNorm,
        platform_elevation: newRoleNorm,
      })
      .eq("id", targetUserId);

    if (updateError) {
      return {
        success: false,
        error: `Failed to update role: ${updateError.message}`,
      };
    }
    return { success: true };
  }

  if (newRoleNorm === "guest") {
    const { error: updateError } = await supabase
      .from("users")
      .update({ role: "guest", platform_elevation: null })
      .eq("id", targetUserId);

    if (updateError) {
      return {
        success: false,
        error: `Failed to update role: ${updateError.message}`,
      };
    }
    return { success: true };
  }

  /* standard */
  const { error: peError } = await supabase
    .from("users")
    .update({ platform_elevation: null })
    .eq("id", targetUserId);

  if (peError) {
    return {
      success: false,
      error: `Failed to update role: ${peError.message}`,
    };
  }

  const admin = createAdminSupabaseClient();
  const { error: rpcError } = await admin.rpc("recompute_effective_user_role", {
    p_user_id: targetUserId,
  });

  if (rpcError) {
    return {
      success: false,
      error: `Failed to recompute role: ${rpcError.message}`,
    };
  }

  return { success: true };
}

/**
 * Get all users that the current user can manage (by **system** role).
 */
export async function getManageableUsers(userId: string): Promise<
  Array<{
    id: string;
    email: string;
    full_name: string | null;
    role: SystemRole;
  }>
> {
  const supabase = await createServerSupabaseClient();

  const { data: userProfile } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .single();

  if (!userProfile) {
    return [];
  }

  const userRole = normalizeSystemRole(userProfile.role as string);

  let manageableRoles: SystemRole[] = [];
  if (userRole === "admin") {
    manageableRoles = ["guest", "standard"];
  }
  if (userRole === "god") {
    manageableRoles = ["guest", "standard", "admin"];
  }

  if (manageableRoles.length === 0) {
    return [];
  }

  const { data: profiles } = await supabase
    .from("users")
    .select("id, email, full_name, role")
    .in("role", manageableRoles);

  return (
    profiles?.map((profile) => ({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: normalizeSystemRole(profile.role as string),
    })) || []
  );
}
