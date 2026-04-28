"use server";

import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import { getActiveUser } from "@/lib/auth";
import { hasPlatformAdminAccess } from "@/lib/auth-shared";

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
  lead: z.boolean(),
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
    lead: boolean;
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
  const leadCount = rows.filter((r) => r.lead).length;
  if (leadCount !== 1) {
    return { ok: false, error: "Select exactly one lead user." };
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
          role: "student",
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

  const leadIndex = rows.findIndex((r) => r.lead);
  const leadUserId = userIds[leadIndex]!;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name, lead_user_id: leadUserId })
    .select("id")
    .single();

  if (orgError) {
    return { ok: false, error: orgError.message };
  }

  const uo = userIds.map((userId, i) => ({
    user_id: userId,
    organization_id: org.id,
    role: i === leadIndex ? "admin" : "student",
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
    ? await supabase.from("users").select("id, email, full_name").in("id", userIds)
    : { data: [] as { id: string; email: string | null; full_name: string | null }[] };

  const userMap = new Map((users || []).map((u) => [u.id, u] as const));
  const members = (uo || []).map((row) => {
    const p = userMap.get(row.user_id);
    return {
      userId: row.user_id,
      email: p?.email ?? null,
      fullName: p?.full_name ?? null,
      orgRole: row.role,
    };
  });

  members.sort((a, b) => {
    if (a.userId === org.lead_user_id) return -1;
    if (b.userId === org.lead_user_id) return 1;
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
      memberCount: (uo || []).length,
      members,
      trainingMaterial,
    },
  };
}
