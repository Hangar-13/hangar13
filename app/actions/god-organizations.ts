"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getActiveUser } from "@/lib/auth";
import { hasPlatformAdminAccess } from "@/lib/auth-shared";
import type { OrganizationRole } from "@/lib/auth-shared";
import { normalizeOrganizationRole } from "@/lib/auth-shared";
import { GOD_UI_ORG_ROLES } from "@/lib/god-user-constants";
import { inviteOrLinkUserToOrganization } from "@/lib/org-invite-member";
import type { DirectoryInviteSearchHit } from "@/app/actions/org-dashboard";

const ORG_MEMBER_SORT_RANK: Record<string, number> = {
  lead: 0,
  supervisor: 1,
  manager: 2,
  mentor: 3,
  student: 4,
};

function assertPlatformAdmin() {
  return getActiveUser().then((u) => {
    if (!u || !hasPlatformAdminAccess(u.role)) {
      return { user: null as Awaited<ReturnType<typeof getActiveUser>> | null, ok: false as const };
    }
    return { user: u, ok: true as const };
  });
}

function splitFullName(full: string | null | undefined) {
  const s = (full || "").trim();
  if (!s) return { first: "", last: "" };
  const i = s.indexOf(" ");
  if (i === -1) return { first: s, last: "" };
  return { first: s.slice(0, i), last: s.slice(i + 1) };
}

/**
 * God reads of other users' rows use the normal session + RLS (migration
 * `System god can read all user rows` on public.users). Service role is only
 * needed for auth.admin inviteUserByEmail when creating new accounts.
 */
export async function godLookupUserByEmail(
  email: string
): Promise<
  | { ok: true; exists: true; firstName: string; lastName: string }
  | { ok: true; exists: false }
  | { ok: false; error: string }
> {
  try {
    const auth = await assertPlatformAdmin();
    if (!auth.ok) {
      return { ok: false, error: "Forbidden" };
    }

    const raw = email.trim();
    if (!raw) {
      return { ok: true, exists: false };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return { ok: true, exists: false };
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select("full_name, email")
      .ilike("email", raw)
      .limit(1);

    if (error) {
      return { ok: false, error: error.message };
    }

    const u = data?.[0];
    if (!u) {
      return { ok: true, exists: false };
    }
    const { first, last } = splitFullName(u.full_name);
    return {
      ok: true,
      exists: true,
      firstName: first,
      lastName: last,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lookup failed";
    return { ok: false, error: message };
  }
}

const userRowSchema = z.object({
  email: z.string().min(1).email(),
  firstName: z.string(),
  lastName: z.string(),
  isNew: z.boolean(),
  organizationRole: z.enum(GOD_UI_ORG_ROLES),
});

const createOrgSchema = z.object({
  name: z.string().min(1, "Organization name is required").max(200),
  users: z.array(userRowSchema).min(1, "Add at least one user"),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export async function godCreateOrganizationWithUsers(input: {
  name: string;
  users: Array<{
    email: string;
    firstName: string;
    lastName: string;
    isNew: boolean;
    organizationRole: OrganizationRole;
  }>;
}): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const parsed = createOrgSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { name, users: rows } = parsed.data;
  const leadCount = rows.filter(
    (r) => normalizeOrganizationRole(r.organizationRole) === "lead"
  ).length;
  if (leadCount !== 1) {
    return {
      ok: false,
      error: "Exactly one user must have the Lead organization role.",
    };
  }

  const emails = rows.map((r) => r.email.trim().toLowerCase());
  if (new Set(emails).size !== emails.length) {
    return { ok: false, error: "Duplicate email addresses in the list." };
  }

  for (const row of rows) {
    if (row.isNew) {
      const f = row.firstName.trim();
      const l = row.lastName.trim();
      if (!f || !l) {
        return {
          ok: false,
          error: `First and last name are required for new user ${row.email}.`,
        };
      }
    }
  }

  const supabase = await createServerSupabaseClient();

  const userIds: string[] = [];
  for (const row of rows) {
    const emailNorm = row.email.trim();
    const { data: foundRows, error: findErr } = await supabase
      .from("users")
      .select("id, email, full_name")
      .ilike("email", emailNorm)
      .limit(1);
    if (findErr) {
      return { ok: false, error: findErr.message };
    }
    const existing = foundRows?.[0];
    if (existing) {
      if (row.isNew) {
        return { ok: false, error: `User ${row.email} already exists.` };
      }
      userIds.push(existing.id);
      continue;
    }

    if (!row.isNew) {
      return { ok: false, error: `User ${row.email} was not found. Refresh and try again.` };
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
            : "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to invite new email addresses (existing users on the list do not need it).",
      };
    }

    const fullName = `${row.firstName.trim()} ${row.lastName.trim()}`.trim();
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      row.email.trim(),
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
        const { data: afterRows } = await supabase
          .from("users")
          .select("id")
          .ilike("email", emailNorm)
          .limit(1);
        const after = afterRows?.[0];
        if (after) {
          userIds.push(after.id);
          continue;
        }
      }
      return { ok: false, error: inviteError.message };
    }
    if (!invited.user?.id) {
      return { ok: false, error: "Invite did not return a user id." };
    }
    userIds.push(invited.user.id);
  }

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name, lead_user_id: null })
    .select("id")
    .single();

  if (orgError) {
    return { ok: false, error: orgError.message };
  }

  const uo = userIds.map((userId, i) => ({
    user_id: userId,
    organization_id: org.id,
    role: normalizeOrganizationRole(rows[i]!.organizationRole as string),
  }));

  const { error: uoError } = await supabase.from("user_organizations").insert(uo);
  if (uoError) {
    return { ok: false, error: uoError.message };
  }

  return { ok: true, organizationId: org.id };
}

export type GodOrganizationListRow = {
  id: string;
  name: string;
  memberCount: number;
};

export async function godListOrganizations(): Promise<
  { ok: true; organizations: GodOrganizationListRow[] } | { ok: false; error: string }
> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createServerSupabaseClient();
  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name")
    .order("name");

  if (error) {
    return { ok: false, error: error.message };
  }

  const rows: GodOrganizationListRow[] = await Promise.all(
    (orgs || []).map(async (o) => {
      const { count } = await supabase
        .from("user_organizations")
        .select("user_id", { count: "exact", head: true })
        .eq("organization_id", o.id);
      return {
        id: o.id,
        name: o.name,
        memberCount: count ?? 0,
      };
    })
  );

  return { ok: true, organizations: rows };
}

export type GodOrganizationDetail = {
  id: string;
  name: string;
  leadUserId: string | null;
  memberCount: number;
  members: Array<{
    userId: string;
    email: string | null;
    fullName: string | null;
    orgRole: string;
  }>;
  trainingMaterial: Array<{
    id: string;
    name: string;
    licensesPurchased: number;
    expirationDate: string | null;
  }>;
};

export async function godGetOrganization(
  id: string
): Promise<{ ok: true; org: GodOrganizationDetail } | { ok: false; error: string }> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createServerSupabaseClient();

  const { data: org, error: oErr } = await supabase
    .from("organizations")
    .select("id, name, lead_user_id")
    .eq("id", id)
    .maybeSingle();

  if (oErr) {
    return { ok: false, error: oErr.message };
  }
  if (!org) {
    return { ok: false, error: "Organization not found." };
  }

  const { data: uo, error: uoErr } = await supabase
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", id);

  if (uoErr) {
    return { ok: false, error: uoErr.message };
  }

  const userIds = (uo || []).map((r) => r.user_id);
  const { data: users } = userIds.length
    ? await supabase
        .from("users")
        .select("id, email, full_name, visible")
        .in("id", userIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null; visible: boolean | null }[] };

  const userMap = new Map((users || []).map((u) => [u.id, u] as const));
  const members = (uo || []).flatMap((row) => {
    const p = userMap.get(row.user_id);
    if (!p || p.visible !== true) {
      return [];
    }
    return [
      {
        userId: row.user_id,
        email: p.email ?? null,
        fullName: p.full_name ?? null,
        orgRole: row.role,
      },
    ];
  });

  members.sort((a, b) => {
    const ra = ORG_MEMBER_SORT_RANK[a.orgRole] ?? 99;
    const rb = ORG_MEMBER_SORT_RANK[b.orgRole] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.email || "").localeCompare(b.email || "");
  });

  const { data: paths } = await supabase
    .from("training_paths")
    .select("id, name, organization_id")
    .eq("organization_id", id);

  const { data: ent } = await supabase
    .from("organization_training_entitlements")
    .select("training_path_id, licenses_purchased, expires_at")
    .eq("organization_id", id);

  const entByPath = new Map<
    string,
    { licenses: number; exp: string | null }
  >();
  for (const e of ent || []) {
    if (e.training_path_id) {
      entByPath.set(e.training_path_id, {
        licenses: e.licenses_purchased ?? 0,
        exp: e.expires_at,
      });
    }
  }

  const trainingMaterial: GodOrganizationDetail["trainingMaterial"] = (
    paths || []
  ).map((p) => {
    const b = entByPath.get(p.id);
    return {
      id: p.id,
      name: p.name,
      licensesPurchased: b?.licenses ?? 0,
      expirationDate: b?.exp ?? null,
    };
  });
  trainingMaterial.sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    org: {
      id: org.id,
      name: org.name,
      leadUserId: org.lead_user_id,
      memberCount: members.length,
      members,
      trainingMaterial,
    },
  };
}

const godOrgRoleSchema = z.enum(GOD_UI_ORG_ROLES);

export async function godUpdateOrganizationMemberRole(
  organizationId: string,
  targetUserId: string,
  newRole: OrganizationRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const parsed = godOrgRoleSchema.safeParse(newRole);
  if (!parsed.success) {
    return { ok: false, error: "Invalid organization role." };
  }

  const roleNorm = normalizeOrganizationRole(parsed.data);
  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId)
    .maybeSingle();

  if (!row) {
    return { ok: false, error: "Member not found in this organization." };
  }

  const currentRole = normalizeOrganizationRole(row.role as string);

  if (currentRole === "lead" && roleNorm !== "lead") {
    return {
      ok: false,
      error:
        "Promote another member to Lead first (that replaces the current lead); then you can change this member’s role.",
    };
  }

  if (roleNorm === "lead") {
    const { error: demoteErr } = await supabase
      .from("user_organizations")
      .update({ role: "supervisor" })
      .eq("organization_id", organizationId)
      .eq("role", "lead")
      .neq("user_id", targetUserId);
    if (demoteErr) {
      return { ok: false, error: demoteErr.message };
    }
  }

  const { error } = await supabase
    .from("user_organizations")
    .update({ role: roleNorm })
    .eq("organization_id", organizationId)
    .eq("user_id", targetUserId);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath(`/dashboard/god/organizations/${organizationId}`);
  revalidatePath("/dashboard/god/organizations");
  return { ok: true };
}

export async function godRemoveOrganizationMember(
  organizationId: string,
  targetUserId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const orgIdParse = z.string().uuid().safeParse(organizationId);
  const userIdParse = z.string().uuid().safeParse(targetUserId);
  if (!orgIdParse.success || !userIdParse.success) {
    return { ok: false, error: "Invalid request." };
  }

  const supabase = await createServerSupabaseClient();

  const { data: row } = await supabase
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", orgIdParse.data)
    .eq("user_id", userIdParse.data)
    .maybeSingle();

  if (!row) {
    return { ok: false, error: "Member not found in this organization." };
  }

  const { error } = await supabase
    .from("user_organizations")
    .delete()
    .eq("organization_id", orgIdParse.data)
    .eq("user_id", userIdParse.data);

  if (error) {
    const msg = error.message || "";
    if (
      msg.includes("organization_must_keep_lead") ||
      msg.toLowerCase().includes("promote another member")
    ) {
      return {
        ok: false,
        error:
          "Promote another member to Lead before removing the current lead, or remove other members first.",
      };
    }
    return { ok: false, error: msg };
  }

  revalidatePath(`/dashboard/god/organizations/${orgIdParse.data}`);
  revalidatePath("/dashboard/god/organizations");
  revalidatePath("/dashboard/organization");
  return { ok: true };
}

/** Directory invite (god org page); requires DB migration `069_org_supervisor_directory_invite_search.sql` (e.g. `npx supabase db push`). */
function parseDirectoryInviteSearchRpc(
  data: unknown
): DirectoryInviteSearchHit[] {
  if (!Array.isArray(data)) {
    return [];
  }
  const users: DirectoryInviteSearchHit[] = [];
  for (const item of data) {
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
  return users;
}

export async function godSearchDirectoryUsersForInvite(
  organizationId: string,
  query: string
): Promise<
  { ok: true; users: DirectoryInviteSearchHit[] } | { ok: false; error: string }
> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const orgIdParse = z.string().uuid().safeParse(organizationId);
  if (!orgIdParse.success) {
    return { ok: false, error: "Invalid organization." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("org_supervisor_search_directory_users", {
    p_organization_id: orgIdParse.data,
    p_query: query.trim(),
    p_limit: 15,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, users: parseDirectoryInviteSearchRpc(data) };
}

export async function godDirectoryEmailAvailableForInvite(
  organizationId: string,
  email: string
): Promise<{ ok: true; available: boolean } | { ok: false; error: string }> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const orgIdParse = z.string().uuid().safeParse(organizationId);
  if (!orgIdParse.success) {
    return { ok: false, error: "Invalid organization." };
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("org_supervisor_directory_email_available", {
    p_organization_id: orgIdParse.data,
    p_email: email.trim(),
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, available: Boolean(data) };
}

const godInviteRowSchema = z.object({
  email: z.string().min(1).email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: godOrgRoleSchema,
  linkedUserId: z.string().uuid().optional().nullable(),
});

export async function godInviteMembersToOrganization(
  organizationId: string,
  users: Array<{
    email: string;
    firstName: string;
    lastName: string;
    role: OrganizationRole;
    linkedUserId?: string | null;
  }>
): Promise<
  { ok: true } | { ok: false; error: string; failedRow?: number }
> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  if (!users.length) {
    return { ok: false, error: "Add at least one user." };
  }

  const supabase = await createServerSupabaseClient();

  const { data: org } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();

  if (!org) {
    return { ok: false, error: "Organization not found." };
  }

  for (let i = 0; i < users.length; i++) {
    const parsed = godInviteRowSchema.safeParse(users[i]);
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
          p_organization_id: organizationId,
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
      organizationId,
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      role: normalizeOrganizationRole(parsed.data.role),
      existingUserId: parsed.data.linkedUserId ?? undefined,
    });
    if (!res.ok) {
      return { ok: false, error: res.error, failedRow: i + 1 };
    }
  }

  revalidatePath(`/dashboard/god/organizations/${organizationId}`);
  revalidatePath("/dashboard/god/organizations");
  return { ok: true };
}
