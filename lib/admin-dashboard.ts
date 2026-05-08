import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminTopOrgRow = {
  rank: number;
  id: string;
  name: string;
  memberCount: number;
};

export type AdminUserBreakdownSlice = {
  label: string;
  count: number;
  color: string;
};

const CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "#6366f1",
  "#14b8a6",
  "#f97316",
  "#8b5cf6",
  "#ec4899",
];

function pickColor(i: number): string {
  return CHART_PALETTE[i % CHART_PALETTE.length]!;
}

/**
 * Platform overview for admin/god: org and user counts, top orgs by membership
 * (rows in `user_organizations` per org), and a pie of every membership row per org
 * plus a slice for users with no org (multi-org users are counted in each org they belong to).
 */
export async function getAdminDashboardData(supabase: SupabaseClient): Promise<{
  totalOrganizations: number;
  totalUsers: number;
  topOrganizations: AdminTopOrgRow[];
  userBreakdownSlices: AdminUserBreakdownSlice[];
}> {
  const [{ count: totalOrgs }, { count: totalUsers }] = await Promise.all([
    supabase.from("organizations").select("*", { count: "exact", head: true }),
    supabase
      .from("users")
      .select("*", { count: "exact", head: true })
      .eq("visible", true),
  ]);

  const { data: memberships, error: memErr } = await supabase
    .from("user_organizations")
    .select("user_id, organization_id");

  if (memErr) {
    console.error("admin dashboard memberships", memErr);
  }

  const rows = memberships ?? [];

  const memberCountByOrg = new Map<string, number>();

  for (const r of rows) {
    const oid = r.organization_id as string;
    memberCountByOrg.set(oid, (memberCountByOrg.get(oid) ?? 0) + 1);
  }

  const topOrgEntries = [...memberCountByOrg.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const topOrgIds = topOrgEntries.map(([id]) => id);
  const { data: orgRows } =
    topOrgIds.length > 0
      ? await supabase
          .from("organizations")
          .select("id, name")
          .in("id", topOrgIds)
      : { data: [] as { id: string; name: string }[] };

  const nameById = new Map(
    (orgRows ?? []).map((o) => [o.id as string, (o.name as string) || "—"])
  );

  const topOrganizations: AdminTopOrgRow[] = topOrgEntries.map(([id, memberCount], i) => ({
    rank: i + 1,
    id,
    name: nameById.get(id) ?? "—",
    memberCount,
  }));

  const { data: allUserRows } = await supabase
    .from("users")
    .select("id")
    .eq("visible", true);
  const allUserIds = (allUserRows ?? []).map((u) => u.id as string);
  const userIdsWithAnyMembership = new Set(
    rows.map((r) => r.user_id as string)
  );
  const noOrganizationCount = allUserIds.filter(
    (id) => !userIdsWithAnyMembership.has(id)
  ).length;

  const membershipEntries = [...memberCountByOrg.entries()].sort(
    (a, b) => b[1] - a[1]
  );
  const maxNamedOrgSlices = 8;
  const topOrgSlices = membershipEntries.slice(0, maxNamedOrgSlices);
  const otherOrgRowSum = membershipEntries
    .slice(maxNamedOrgSlices)
    .reduce((s, [, c]) => s + c, 0);

  const { data: pieOrgNameRows } =
    topOrgSlices.length > 0
      ? await supabase
          .from("organizations")
          .select("id, name")
          .in(
            "id",
            topOrgSlices.map(([id]) => id)
          )
      : { data: [] as { id: string; name: string }[] };

  const orgName = new Map(
    (pieOrgNameRows ?? []).map((o) => [o.id as string, (o.name as string) || "—"])
  );

  const userBreakdownSlices: AdminUserBreakdownSlice[] = [];
  let colorIndex = 0;

  if (noOrganizationCount > 0) {
    userBreakdownSlices.push({
      label: "No organization",
      count: noOrganizationCount,
      color: pickColor(colorIndex++),
    });
  }

  for (const [oid, c] of topOrgSlices) {
    userBreakdownSlices.push({
      label: orgName.get(oid) ?? "—",
      count: c,
      color: pickColor(colorIndex++),
    });
  }

  if (otherOrgRowSum > 0) {
    userBreakdownSlices.push({
      label: "Other organizations",
      count: otherOrgRowSum,
      color: pickColor(colorIndex++),
    });
  }

  return {
    totalOrganizations: totalOrgs ?? 0,
    totalUsers: totalUsers ?? 0,
    topOrganizations,
    userBreakdownSlices,
  };
}
