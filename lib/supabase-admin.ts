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
      "Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local (Supabase → Project Settings → API → service_role secret). Required to send email invitations to people who do not yet have an account. Linking existing users does not use this key."
    );
  }
  return createClient(supabaseUrl, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
