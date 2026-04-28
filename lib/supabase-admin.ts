import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

/**
 * Service-role client for Supabase auth admin APIs (e.g. `inviteUserByEmail`).
 * Server-only. Reads of `public.users` for god UIs use the session client + RLS instead.
 */
export function createAdminSupabaseClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local to create or invite org users from the God dashboard."
    );
  }
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
