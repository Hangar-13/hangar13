import type { SupabaseClient } from "@supabase/supabase-js";

/** Shape of public.logbook_entries rows used by student UI (fields optional beyond id). */
export type LogbookEntryRow = {
  id: string;
  entry_date: string;
  hours_worked?: unknown;
  description?: string;
  status?: string;
  skills_practiced?: unknown;
  reject_reason?: unknown;
  [key: string]: unknown;
};

/**
 * Load logbook rows for a trainee. When the signed-in user is that trainee, uses
 * list_my_logbook_entries() (SECURITY DEFINER + row_security off) so reads are not
 * dropped by overlapping RLS policies. Mentors/admins keep the direct table query.
 */
export async function queryLogbookEntriesForOwner(
  supabase: SupabaseClient,
  ownerUserId: string
): Promise<{
  data: LogbookEntryRow[] | null;
  error: { message: string } | null;
}> {
  const { data: auth } = await supabase.auth.getUser();
  if (auth.user?.id === ownerUserId) {
    const res = await supabase.rpc("list_my_logbook_entries");
    return {
      data: (res.data as LogbookEntryRow[]) ?? null,
      error: res.error,
    };
  }
  const res = await supabase
    .from("logbook_entries")
    .select("*")
    .eq("user_id", ownerUserId)
    .order("entry_date", { ascending: false });
  return {
    data: res.data as LogbookEntryRow[] | null,
    error: res.error,
  };
}
