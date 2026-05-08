import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  normalizeOrganizationRole,
  type OrganizationRole,
} from "@/lib/auth-shared";
import {
  ACTIVE_ORGANIZATION_COOKIE,
  resolveActiveOrganizationId,
} from "@/lib/active-organization";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";

export type ActiveOrganizationPayload = {
  activeOrganizationId: string | null;
  organizationRole: OrganizationRole | null;
  memberships: Array<{
    organizationId: string;
    organizationName: string;
    role: OrganizationRole;
  }>;
};

export async function GET(): Promise<
  NextResponse<ActiveOrganizationPayload | { error: string }>
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const cookieOrg = cookieStore.get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;

  const profile = await fetchSessionUserProfile(supabase);

  const { data: memRows } = await supabase
    .from("user_organizations")
    .select("organization_id, role")
    .eq("user_id", user.id);

  const orgIds = [...new Set((memRows ?? []).map((r) => r.organization_id as string))];
  const namesById = new Map<string, string>();

  if (orgIds.length > 0) {
    const { data: orgRows } = await supabase
      .from("organizations")
      .select("id, name")
      .in("id", orgIds);
    for (const o of orgRows ?? []) {
      namesById.set(o.id as string, (o.name as string) ?? "");
    }
  }

  const memberships: ActiveOrganizationPayload["memberships"] = (memRows ?? []).map(
    (r) => ({
      organizationId: r.organization_id as string,
      organizationName: namesById.get(r.organization_id as string) ?? "Organization",
      role: normalizeOrganizationRole(r.role as string),
    })
  );

  const flat: { organization_id: string; role: string }[] = memberships.map((m) => ({
    organization_id: m.organizationId,
    role: m.role,
  }));

  const activeOrganizationId = resolveActiveOrganizationId(
    flat,
    cookieOrg,
    profile?.last_active_organization_id as string | undefined
  );

  let organizationRole: OrganizationRole | null = null;
  if (activeOrganizationId) {
    const m = memberships.find((x) => x.organizationId === activeOrganizationId);
    organizationRole = m?.role ?? null;
  }

  return NextResponse.json({
    activeOrganizationId,
    organizationRole,
    memberships,
  });
}
