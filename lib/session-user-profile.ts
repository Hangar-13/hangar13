import type { SupabaseClient } from "@supabase/supabase-js";

/** Subset of public.users returned by get_session_user_profile() RPC. */
export type SessionUserProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  visible: boolean | null;
  last_active_organization_id: string | null;
  current_user_training_id: string | null;
  current_certification: string | null;
};

/**
 * Loads the current session user's profile row via SECURITY DEFINER RPC (bypasses broken users RLS).
 */
export async function fetchSessionUserProfile(
  supabase: SupabaseClient
): Promise<SessionUserProfileRow | null> {
  const { data, error } = await supabase.rpc("get_session_user_profile");

  if (error) {
    console.error("fetchSessionUserProfile rpc:", error.message, error.code);
    return null;
  }

  const rows = data as SessionUserProfileRow[] | null;
  if (!rows?.length) {
    return null;
  }

  return rows[0] ?? null;
}
