"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getActiveOrgDashboardContext } from "@/lib/org-dashboard-context";
import type { OrganizationRole } from "@/lib/auth-shared";
import { hasOrganizationRolePermission, normalizeOrganizationRole } from "@/lib/auth-shared";
import { inviteOrLinkUserToOrganization } from "@/lib/org-invite-member";

const assignableOrgRoles = z.enum(["student", "mentor", "manager"]);

async function assertOrgSupervisor() {
  const ctx = await getActiveOrgDashboardContext();
  if (
    !ctx ||
    !hasOrganizationRolePermission(ctx.organizationRole, "supervisor")
  ) {
    return {
      ok: false as const,
      error: "Forbidden",
    };
  }
  return { ok: true as const, ctx };
}

export type DirectoryInviteSearchHit = {
  id: string;
  email: string;
  full_name: string | null;
};

/** Directory invite RPCs; requires DB migration `069_org_supervisor_directory_invite_search.sql` (e.g. `npx supabase db push`). */
export async function orgSearchDirectoryUsersForInvite(
  query: string
): Promise<
  { ok: true; users: DirectoryInviteSearchHit[] } | { ok: false; error: string }
> {
  const auth = await assertOrgSupervisor();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("org_supervisor_search_directory_users", {
    p_organization_id: auth.ctx.organizationId,
    p_query: query.trim(),
    p_limit: 15,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const raw = data as unknown;
  if (!Array.isArray(raw)) {
    return { ok: true, users: [] };
  }

  const users: DirectoryInviteSearchHit[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const id = o.id != null ? String(o.id) : "";
    const email = o.email != null ? String(o.email) : "";
    if (!id || !email) continue;
    users.push({
      id,
      email,
      full_name: o.full_name != null ? String(o.full_name) : null,
    });
  }
  return { ok: true, users };
}

export async function orgDirectoryEmailAvailableForInvite(
  email: string
): Promise<{ ok: true; available: boolean } | { ok: false; error: string }> {
  const auth = await assertOrgSupervisor();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("org_supervisor_directory_email_available", {
    p_organization_id: auth.ctx.organizationId,
    p_email: email.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, available: Boolean(data) };
}

export async function orgUpdateMemberRole(
  targetUserId: string,
  newRole: OrganizationRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertOrgSupervisor();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const roleNorm = normalizeOrganizationRole(newRole);
  if (!assignableOrgRoles.safeParse(roleNorm).success) {
    return {
      ok: false,
      error: "Supervisors may only assign student, mentor, or manager roles.",
    };
  }

  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("user_organizations")
    .select("role")
    .eq("organization_id", auth.ctx.organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!row?.role) {
    return { ok: false, error: "Member not found in this organization." };
  }

  if (row.role === "supervisor" || row.role === "lead") {
    return {
      ok: false,
      error:
        "Organization supervisors and leads cannot change other supervisors or leads in-app; use platform admin.",
    };
  }

  const { error } = await supabase
    .from("user_organizations")
    .update({ role: roleNorm })
    .eq("organization_id", auth.ctx.organizationId)
    .eq("user_id", targetUserId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/organization");
  return { ok: true };
}

export async function orgRemoveMember(
  targetUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertOrgSupervisor();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("user_organizations")
    .select("role")
    .eq("organization_id", auth.ctx.organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!row?.role) {
    return { ok: false, error: "Member not found in this organization." };
  }

  if (row.role === "supervisor" || row.role === "lead") {
    return {
      ok: false,
      error:
        "Removing organization supervisors or leads requires platform admin.",
    };
  }

  const { error } = await supabase
    .from("user_organizations")
    .delete()
    .eq("organization_id", auth.ctx.organizationId)
    .eq("user_id", targetUserId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/organization");
  return { ok: true };
}

const inviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: assignableOrgRoles,
});

const inviteRowSchema = inviteSchema.extend({
  linkedUserId: z.string().uuid().optional().nullable(),
});

export async function orgInviteMember(input: {
  email: string;
  firstName: string;
  lastName: string;
  role: OrganizationRole;
  linkedUserId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertOrgSupervisor();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const parsed = inviteRowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createServerSupabaseClient();

  if (!parsed.data.linkedUserId) {
    const { data: rid, error: rerr } = await supabase.rpc(
      "org_supervisor_invite_resolve_user_id",
      {
        p_organization_id: auth.ctx.organizationId,
        p_email: parsed.data.email.trim(),
      }
    );
    if (rerr) {
      return { ok: false, error: rerr.message };
    }
    if (rid) {
      return {
        ok: false,
        error:
          "That email already has an account. Choose the person from suggestions, or use a different email.",
      };
    }
  }
  const res = await inviteOrLinkUserToOrganization({
    supabase,
    organizationId: auth.ctx.organizationId,
    email: parsed.data.email,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName,
    role: parsed.data.role,
    existingUserId: parsed.data.linkedUserId ?? undefined,
  });

  if (!res.ok) {
    return res;
  }
  revalidatePath("/dashboard/organization");
  return { ok: true };
}

const batchInviteRowSchema = inviteRowSchema;

export async function orgInviteMembers(input: {
  users: Array<{
    email: string;
    firstName: string;
    lastName: string;
    role: OrganizationRole;
    linkedUserId?: string | null;
  }>;
}): Promise<
  | { ok: true }
  | { ok: false; error: string; failedRow?: number }
> {
  const auth = await assertOrgSupervisor();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  if (!input.users.length) {
    return { ok: false, error: "Add at least one user." };
  }

  const supabase = await createServerSupabaseClient();

  for (let i = 0; i < input.users.length; i++) {
    const row = input.users[i];
    const parsed = batchInviteRowSchema.safeParse(row);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input",
        failedRow: i + 1,
      };
    }

    if (!parsed.data.linkedUserId) {
      const { data: rid, error: rerr } = await supabase.rpc(
        "org_supervisor_invite_resolve_user_id",
        {
          p_organization_id: auth.ctx.organizationId,
          p_email: parsed.data.email.trim(),
        }
      );
      if (rerr) {
        return { ok: false, error: rerr.message, failedRow: i + 1 };
      }
      if (rid) {
        return {
          ok: false,
          error:
            "That email already has an account. Choose the person from suggestions, or use a different email.",
          failedRow: i + 1,
        };
      }
    }

    const res = await inviteOrLinkUserToOrganization({
      supabase,
      organizationId: auth.ctx.organizationId,
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: parsed.data.role,
      existingUserId: parsed.data.linkedUserId ?? undefined,
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.error,
        failedRow: i + 1,
      };
    }
  }

  revalidatePath("/dashboard/organization");
  return { ok: true };
}

const entitlementUpdateSchema = z.object({
  entitlementId: z.string().uuid(),
  licensesPurchased: z.coerce.number().int().min(0),
  expiresAt: z.string().nullable(),
});

export async function orgUpdateEntitlement(input: {
  entitlementId: string;
  licensesPurchased: number;
  expiresAt: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertOrgSupervisor();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const parsed = entitlementUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("organization_training_entitlements")
    .select("organization_id")
    .eq("id", parsed.data.entitlementId)
    .maybeSingle();

  if (!row || row.organization_id !== auth.ctx.organizationId) {
    return { ok: false, error: "Entitlement not found for this organization." };
  }

  const expires =
    parsed.data.expiresAt && parsed.data.expiresAt.trim() !== ""
      ? parsed.data.expiresAt.trim()
      : null;

  const { error } = await supabase
    .from("organization_training_entitlements")
    .update({
      licenses_purchased: parsed.data.licensesPurchased,
      expires_at: expires,
    })
    .eq("id", parsed.data.entitlementId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/organization");
  return { ok: true };
}

export async function orgCreateEntitlementForPath(input: {
  trainingPathId: string;
  licensesPurchased: number;
  expiresAt: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertOrgSupervisor();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const schema = z.object({
    trainingPathId: z.string().uuid(),
    licensesPurchased: z.coerce.number().int().min(0),
    expiresAt: z.string().nullable(),
  });

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createServerSupabaseClient();

  const { data: path } = await supabase
    .from("training_paths")
    .select("organization_id")
    .eq("id", parsed.data.trainingPathId)
    .maybeSingle();

  if (!path || path.organization_id !== auth.ctx.organizationId) {
    return { ok: false, error: "Training path not in this organization." };
  }

  const expires =
    parsed.data.expiresAt && parsed.data.expiresAt.trim() !== ""
      ? parsed.data.expiresAt.trim()
      : null;

  const { error } = await supabase.from("organization_training_entitlements").insert({
    organization_id: auth.ctx.organizationId,
    training_path_id: parsed.data.trainingPathId,
    licenses_purchased: parsed.data.licensesPurchased,
    expires_at: expires,
    course_id: null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/dashboard/organization");
  return { ok: true };
}
