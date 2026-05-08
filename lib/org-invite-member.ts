import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeOrganizationRole, type OrganizationRole } from "@/lib/auth-shared";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

/**
 * Add an existing user by id link, or invite a new auth user and link them to the organization.
 * Caller must enforce role permissions (supervisor vs god).
 *
 * User resolution uses session RPCs (migration `070_org_invite_resolve_user_rpc.sql`).
 * `inviteUserByEmail` requires `SUPABASE_SERVICE_ROLE_KEY` only when no user exists yet.
 */
export async function inviteOrLinkUserToOrganization(params: {
  supabase: SupabaseClient;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: OrganizationRole;
  /** When set, link this user id after verifying email matches (definer read of public.users). */
  existingUserId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const {
    supabase,
    organizationId,
    email: rawEmail,
    firstName,
    lastName,
    role,
    existingUserId,
  } = params;

  const roleNorm = normalizeOrganizationRole(role);

  let existingId: string | undefined;
  if (existingUserId) {
    const { data: verified, error: verErr } = await supabase.rpc(
      "org_supervisor_invite_verify_linked_user",
      {
        p_organization_id: organizationId,
        p_user_id: existingUserId,
        p_email: rawEmail.trim(),
      }
    );
    if (verErr) {
      return { ok: false, error: verErr.message };
    }
    if (!verified) {
      return {
        ok: false,
        error: "Selected user was not found or email does not match.",
      };
    }
    existingId = existingUserId;
  } else {
    const { data: rid, error: resErr } = await supabase.rpc(
      "org_supervisor_invite_resolve_user_id",
      {
        p_organization_id: organizationId,
        p_email: rawEmail.trim(),
      }
    );
    if (resErr) {
      return { ok: false, error: resErr.message };
    }
    if (rid) {
      existingId = rid as string;
    }
  }

  if (existingId) {
    const { data: dup } = await supabase
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", existingId)
      .maybeSingle();

    if (dup?.user_id) {
      return { ok: false, error: "That user is already in this organization." };
    }

    if (roleNorm === "lead") {
      const { error: demoteErr } = await supabase
        .from("user_organizations")
        .update({ role: "supervisor" })
        .eq("organization_id", organizationId)
        .eq("role", "lead");
      if (demoteErr) {
        return { ok: false, error: demoteErr.message };
      }
    }

    const { error: insErr } = await supabase.from("user_organizations").insert({
      user_id: existingId,
      organization_id: organizationId,
      role: roleNorm,
    });

    if (insErr) {
      return { ok: false, error: insErr.message };
    }

    return { ok: true };
  }

  let admin: ReturnType<typeof createAdminSupabaseClient>;
  try {
    admin = createAdminSupabaseClient();
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Cannot send email invitations: missing service role configuration.",
    };
  }

  const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    rawEmail.trim(),
    {
      data: {
        full_name: fullName,
        role: "standard",
      },
    }
  );

  if (inviteError) {
    const msg = inviteError.message.toLowerCase();
    if (msg.includes("registered") || msg.includes("already been registered")) {
      const { data: afterId, error: afterErr } = await supabase.rpc(
        "org_supervisor_invite_resolve_user_id",
        {
          p_organization_id: organizationId,
          p_email: rawEmail.trim(),
        }
      );
      if (afterErr) {
        return { ok: false, error: afterErr.message };
      }
      const id = afterId as string | null;
      if (!id) {
        return { ok: false, error: inviteError.message };
      }
      if (roleNorm === "lead") {
        const { error: demoteErr } = await supabase
          .from("user_organizations")
          .update({ role: "supervisor" })
          .eq("organization_id", organizationId)
          .eq("role", "lead");
        if (demoteErr) {
          return { ok: false, error: demoteErr.message };
        }
      }
      const { error: insErr } = await supabase.from("user_organizations").insert({
        user_id: id,
        organization_id: organizationId,
        role: roleNorm,
      });
      if (insErr) {
        return { ok: false, error: insErr.message };
      }
      return { ok: true };
    }
    return { ok: false, error: inviteError.message };
  }

  const newId = invited.user?.id;
  if (!newId) {
    return { ok: false, error: "Invite did not return a user id." };
  }

  if (roleNorm === "lead") {
    const { error: demoteErr } = await supabase
      .from("user_organizations")
      .update({ role: "supervisor" })
      .eq("organization_id", organizationId)
      .eq("role", "lead");
    if (demoteErr) {
      return { ok: false, error: demoteErr.message };
    }
  }

  const { error: uoErr } = await supabase.from("user_organizations").insert({
    user_id: newId,
    organization_id: organizationId,
    role: roleNorm,
  });

  if (uoErr) {
    return { ok: false, error: uoErr.message };
  }

  return { ok: true };
}
