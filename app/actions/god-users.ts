"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getActiveUser } from "@/lib/auth";
import {
  hasPlatformAdminAccess,
  normalizeOrganizationRole,
  type OrganizationRole,
  type SystemRole,
} from "@/lib/auth-shared";
import { GOD_UI_ORG_ROLES, GOD_UI_SYSTEM_ROLES } from "@/lib/god-user-constants";
import { updateUserRole } from "@/lib/role-management";

function assertPlatformAdmin() {
  return getActiveUser().then((u) => {
    if (!u || !hasPlatformAdminAccess(u.role)) {
      return { user: null as Awaited<ReturnType<typeof getActiveUser>> | null, ok: false as const };
    }
    return { user: u, ok: true as const };
  });
}

export type GodUserListOrg = {
  name: string;
  isLead: boolean;
};

export type GodUserListRow = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: string;
  createdAt: string;
  organizations: GodUserListOrg[];
};

export type GodListUsersResult =
  | { ok: true; rows: GodUserListRow[]; total: number }
  | { ok: false; error: string };

export async function godListUsersPaginated(input: {
  search: string;
  page: number;
  pageSize: number;
}): Promise<GodListUsersResult> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const page = Math.max(0, input.page);
  const pageSize = Math.min(100, Math.max(1, input.pageSize));
  const search = (input.search || "").trim();
  const pSearch = search.length ? search : null;
  const offset = page * pageSize;

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("god_list_users_paginated", {
    p_search: pSearch,
    p_limit: pageSize,
    p_offset: offset,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  const payload = data as
    | {
        rows: Array<{
          id: string;
          email: string | null;
          full_name: string | null;
          role: string;
          created_at: string;
          organizations?: unknown;
        }> | null;
        total: number;
      }
    | null;

  if (!payload || !Array.isArray(payload.rows)) {
    return { ok: false, error: "Invalid list response" };
  }

  const total = Number(payload.total) || 0;
  const rows: GodUserListRow[] = payload.rows.map((r) => {
    const orgsRaw = r.organizations;
    const organizations: GodUserListOrg[] = Array.isArray(orgsRaw)
      ? orgsRaw.map((item) => {
          const o = item as { name?: string; is_lead?: boolean };
          return {
            name: typeof o.name === "string" ? o.name : "—",
            isLead: Boolean(o.is_lead),
          };
        })
      : [];
    return {
      id: r.id,
      email: r.email,
      fullName: r.full_name,
      role: r.role,
      createdAt: r.created_at,
      organizations,
    };
  });

  return { ok: true, rows, total };
}

const createUserSchema = z.object({
  email: z.string().min(1).email(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  systemRole: z.enum(GOD_UI_SYSTEM_ROLES),
  organizations: z.array(
    z.object({
      organizationId: z.string().uuid(),
      role: z.enum(GOD_UI_ORG_ROLES),
    })
  ),
});

export async function godCreateUser(input: {
  email: string;
  firstName: string;
  lastName: string;
  systemRole: SystemRole;
  organizations: { organizationId: string; role: OrganizationRole }[];
}): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const seenOrgs = new Set<string>();
  for (const o of input.organizations) {
    if (seenOrgs.has(o.organizationId)) {
      return { ok: false, error: "Each organization can only appear once." };
    }
    seenOrgs.add(o.organizationId);
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createServerSupabaseClient();
  const emailNorm = parsed.data.email.trim();
  const { data: existing, error: findErr } = await supabase
    .from("users")
    .select("id")
    .ilike("email", emailNorm)
    .eq("visible", true)
    .limit(1);

  if (findErr) {
    return { ok: false, error: findErr.message };
  }
  if (existing?.[0]) {
    return { ok: false, error: "A user with this email already exists." };
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
          : "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local to invite users.",
    };
  }

  const fullName = `${parsed.data.firstName.trim()} ${parsed.data.lastName.trim()}`.trim();
  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
    parsed.data.email.trim(),
    {
      data: {
        full_name: fullName,
        role: parsed.data.systemRole,
      },
    }
  );

  if (inviteError) {
    const msg = inviteError.message.toLowerCase();
    if (msg.includes("registered") || msg.includes("already been registered")) {
      return { ok: false, error: "A user with this email already exists." };
    }
    return { ok: false, error: inviteError.message };
  }

  const newId = invited.user?.id;
  if (!newId) {
    return { ok: false, error: "Invite did not return a user id." };
  }

  if (parsed.data.organizations.length) {
    const { error: uoError } = await supabase.from("user_organizations").insert(
      parsed.data.organizations.map((o) => ({
        user_id: newId,
        organization_id: o.organizationId,
        role: o.role,
      }))
    );
    if (uoError) {
      return { ok: false, error: uoError.message };
    }
  }

  return { ok: true, userId: newId };
}

export type GodUserDetail = {
  id: string;
  email: string | null;
  fullName: string | null;
  role: string;
  createdAt: string;
  organizations: Array<{
    organizationId: string;
    name: string;
    role: OrganizationRole;
    isLead: boolean;
    /** When this user was added to the organization (`user_organizations.created_at`). */
    dateJoined: string;
  }>;
  trainings: Array<{
    id: string;
    name: string;
    statusLabel: "Enrolled" | "Completed" | "Discontinued";
    dateEnrolled: string | null;
    enrolledBy: string;
    dateCompleted: string | null;
  }>;
};

export async function godGetUserDetail(
  userId: string
): Promise<{ ok: true; user: GodUserDetail } | { ok: false; error: string }> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok) {
    return { ok: false, error: "Forbidden" };
  }

  const supabase = await createServerSupabaseClient();

  const { data: u, error: uErr } = await supabase
    .from("users")
    .select("id, email, full_name, role, created_at")
    .eq("id", userId)
    .maybeSingle();

  if (uErr) {
    return { ok: false, error: uErr.message };
  }
  if (!u) {
    return { ok: false, error: "User not found." };
  }

  const { data: uo, error: uoErr } = await supabase
    .from("user_organizations")
    .select("organization_id, role, created_at")
    .eq("user_id", userId);

  if (uoErr) {
    return { ok: false, error: uoErr.message };
  }

  const uoList = uo || [];
  const orgIds = [...new Set(uoList.map((r) => r.organization_id))];
  const { data: orgRows, error: orgErr } = orgIds.length
    ? await supabase.from("organizations").select("id, name").in("id", orgIds)
    : { data: [] as { id: string; name: string }[], error: null };

  if (orgErr) {
    return { ok: false, error: orgErr.message };
  }

  const byOrg = new Map((orgRows || []).map((o) => [o.id, o] as const));
  const organizations: GodUserDetail["organizations"] = uoList
    .map((r) => {
      const o = byOrg.get(r.organization_id);
      if (!o) return null;
      return {
        organizationId: o.id,
        name: o.name,
        role: normalizeOrganizationRole(r.role as string),
        isLead: normalizeOrganizationRole(r.role as string) === "lead",
        dateJoined: r.created_at,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const orgMemberIds = new Set(organizations.map((o) => o.organizationId));

  const { data: ut, error: utErr } = await supabase
    .from("user_trainings")
    .select("id, status, start_date, end_date, training_path_id")
    .eq("user_id", userId)
    .order("start_date", { ascending: false });

  if (utErr) {
    return { ok: false, error: utErr.message };
  }

  const pathIds = (ut || [])
    .map((t) => t.training_path_id)
    .filter(Boolean) as string[];

  const { data: paths } = pathIds.length
    ? await supabase
        .from("training_paths")
        .select("id, name, organization_id")
        .in("id", pathIds)
    : { data: [] as { id: string; name: string; organization_id: string }[] };

  const pathMap = new Map((paths || []).map((p) => [p.id, p] as const));

  const materialOrgIds = [
    ...new Set(
      (ut || [])
        .map((t) => pathMap.get(t.training_path_id)?.organization_id)
        .filter((x): x is string => typeof x === "string")
    ),
  ];

  const { data: materialOrgs } = materialOrgIds.length
    ? await supabase.from("organizations").select("id, name").in("id", materialOrgIds)
    : { data: [] as { id: string; name: string }[] };

  const materialOrgName = new Map((materialOrgs || []).map((o) => [o.id, o.name] as const));

  const trainings: GodUserDetail["trainings"] = (ut || []).map((t) => {
    const mat =
      t.training_path_id && pathMap.get(t.training_path_id)
        ? pathMap.get(t.training_path_id)
        : null;
    const name = mat?.name ?? "—";
    const matOrgId = mat?.organization_id ?? null;

    let statusLabel: "Enrolled" | "Completed" | "Discontinued" = "Enrolled";
    if (t.status === "completed") {
      statusLabel = "Completed";
    } else if (t.status === "inactive") {
      statusLabel = "Discontinued";
    } else {
      statusLabel = "Enrolled";
    }

    let enrolledBy = "—";
    if (matOrgId) {
      if (orgMemberIds.has(matOrgId)) {
        enrolledBy = materialOrgName.get(matOrgId) ?? "—";
      } else {
        enrolledBy = "Self";
      }
    } else {
      enrolledBy = "Self";
    }

    return {
      id: t.id,
      name,
      statusLabel,
      dateEnrolled: t.start_date ?? null,
      enrolledBy,
      dateCompleted: t.end_date,
    };
  });

  return {
    ok: true,
    user: {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      role: u.role,
      createdAt: u.created_at,
      organizations,
      trainings,
    },
  };
}

export async function godUpdateUserSystemRole(
  userId: string,
  role: SystemRole
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await assertPlatformAdmin();
  if (!auth.ok || !auth.user) {
    return { ok: false, error: "Forbidden" };
  }

  if (!GOD_UI_SYSTEM_ROLES.includes(role)) {
    return { ok: false, error: "Invalid role" };
  }

  const result = await updateUserRole(userId, role, auth.user.id);
  if (!result.success) {
    return { ok: false, error: result.error ?? "Failed to update role" };
  }
  return { ok: true };
}
