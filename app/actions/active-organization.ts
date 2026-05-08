"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/active-organization";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export async function setActiveOrganizationId(
  organizationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: row } = await supabase
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!row?.organization_id) {
    return { ok: false, error: "Not a member of this organization" };
  }

  const jar = await cookies();
  jar.set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  const { error } = await supabase
    .from("users")
    .update({ last_active_organization_id: organizationId })
    .eq("id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}
