import { createServerSupabaseClient } from "./supabase-server";
import { fetchSessionUserProfile } from "./session-user-profile";
import { type ActiveUser, normalizeSystemRole } from "./auth-shared";

/** Server-only: session + Supabase. For types and role helpers use `@/lib/auth-shared`. */
export async function getActiveUser(): Promise<ActiveUser | null> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const profile = await fetchSessionUserProfile(supabase);
  if (!profile) {
    return null;
  }

  return {
    id: user.id,
    email: profile.email || user.email || "",
    role: normalizeSystemRole(profile.role as string),
    full_name: profile.full_name || undefined,
  };
}

export async function requireAuth(): Promise<ActiveUser> {
  const user = await getActiveUser();

  if (!user) {
    const { redirect } = await import("next/navigation");
    redirect("/auth/login");
  }

  return user as ActiveUser;
}
