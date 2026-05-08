import { createServerSupabaseClient } from "@/lib/supabase-server";

export type OrgMemberRow = {
  userId: string;
  email: string | null;
  fullName: string | null;
  orgRole: string;
};

const ORG_MEMBER_SORT_RANK: Record<string, number> = {
  lead: 0,
  supervisor: 1,
  manager: 2,
  mentor: 3,
  student: 4,
};

export type OrgEntitlementRow = {
  id: string;
  trainingPathId: string | null;
  trainingPathName: string;
  licensesPurchased: number;
  expiresAt: string | null;
};

export async function loadOrgOverview(organizationId: string): Promise<{
  memberCount: number;
  activeEnrollments: number;
  completedEnrollments: number;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: uoRows } = await supabase
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", organizationId);

  const orgMemberIds = (uoRows ?? []).map((r) => r.user_id as string);
  let memberCount = 0;
  if (orgMemberIds.length > 0) {
    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("id", orgMemberIds)
      .eq("visible", true);
    memberCount = count ?? 0;
  }

  const { data: paths } = await supabase
    .from("training_paths")
    .select("id")
    .eq("organization_id", organizationId);

  const pathIds = (paths ?? []).map((p) => p.id as string);
  let activeEnrollments = 0;
  let completedEnrollments = 0;

  if (pathIds.length > 0) {
    const { count: active } = await supabase
      .from("user_trainings")
      .select("id", { count: "exact", head: true })
      .in("training_path_id", pathIds)
      .neq("status", "completed");

    const { count: done } = await supabase
      .from("user_trainings")
      .select("id", { count: "exact", head: true })
      .in("training_path_id", pathIds)
      .eq("status", "completed");

    activeEnrollments = active ?? 0;
    completedEnrollments = done ?? 0;
  }

  return {
    memberCount: memberCount ?? 0,
    activeEnrollments,
    completedEnrollments,
  };
}

export async function loadOrgMembers(organizationId: string): Promise<OrgMemberRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data: uo, error: uoErr } = await supabase
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", organizationId);

  if (uoErr) {
    console.error("loadOrgMembers", uoErr);
    return [];
  }

  const userIds = (uo ?? []).map((r) => r.user_id as string);
  const { data: users } = userIds.length
    ? await supabase
        .from("users")
        .select("id, email, full_name, visible")
        .in("id", userIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null; visible: boolean | null }[] };

  const userMap = new Map((users ?? []).map((u) => [u.id, u] as const));
  const rows: OrgMemberRow[] = (uo ?? []).flatMap((row) => {
    const p = userMap.get(row.user_id as string);
    if (!p || p.visible !== true) {
      return [];
    }
    return [
      {
        userId: row.user_id as string,
        email: p.email ?? null,
        fullName: p.full_name ?? null,
        orgRole: row.role as string,
      },
    ];
  });

  rows.sort((a, b) => {
    const ra = ORG_MEMBER_SORT_RANK[a.orgRole] ?? 99;
    const rb = ORG_MEMBER_SORT_RANK[b.orgRole] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a.email || "").localeCompare(b.email || "");
  });

  return rows;
}

export async function loadOrgSubscriptions(
  organizationId: string
): Promise<OrgEntitlementRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data: paths } = await supabase
    .from("training_paths")
    .select("id, name")
    .eq("organization_id", organizationId);

  const { data: ent } = await supabase
    .from("organization_training_entitlements")
    .select("id, training_path_id, licenses_purchased, expires_at")
    .eq("organization_id", organizationId);

  const entByPath = new Map<
    string,
    { id: string; licenses: number; exp: string | null }
  >();
  for (const e of ent ?? []) {
    if (e.training_path_id) {
      entByPath.set(e.training_path_id as string, {
        id: e.id as string,
        licenses: e.licenses_purchased ?? 0,
        exp: e.expires_at as string | null,
      });
    }
  }

  const rows: OrgEntitlementRow[] = (paths ?? []).map((p) => {
    const b = entByPath.get(p.id as string);
    return {
      id: b?.id ?? "",
      trainingPathId: p.id as string,
      trainingPathName: (p.name as string) ?? "—",
      licensesPurchased: b?.licenses ?? 0,
      expiresAt: b?.exp ?? null,
    };
  });

  rows.sort((a, b) => a.trainingPathName.localeCompare(b.trainingPathName));
  return rows;
}

export async function loadOrgProgressByMember(
  organizationId: string
): Promise<
  Array<{
    userId: string;
    email: string | null;
    fullName: string | null;
    activeCount: number;
    completedCount: number;
  }>
> {
  const supabase = await createServerSupabaseClient();

  const { data: paths } = await supabase
    .from("training_paths")
    .select("id")
    .eq("organization_id", organizationId);

  const pathIds = (paths ?? []).map((p) => p.id as string);
  if (pathIds.length === 0) {
    return [];
  }

  const { data: ut } = await supabase
    .from("user_trainings")
    .select("user_id, status")
    .in("training_path_id", pathIds);

  const memberIds = await loadOrgMembers(organizationId);
  const stats = new Map<
    string,
    { active: number; completed: number }
  >();

  for (const m of memberIds) {
    stats.set(m.userId, { active: 0, completed: 0 });
  }

  for (const row of ut ?? []) {
    const uid = row.user_id as string;
    if (!stats.has(uid)) continue;
    const s = stats.get(uid)!;
    if (row.status === "completed") {
      s.completed += 1;
    } else {
      s.active += 1;
    }
  }

  return memberIds.map((m) => {
    const s = stats.get(m.userId) ?? { active: 0, completed: 0 };
    return {
      userId: m.userId,
      email: m.email,
      fullName: m.fullName,
      activeCount: s.active,
      completedCount: s.completed,
    };
  });
}

export async function getOrganizationLeadUserId(
  organizationId: string
): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("lead_user_id")
    .eq("id", organizationId)
    .maybeSingle();
  return (org?.lead_user_id as string | undefined) ?? null;
}
