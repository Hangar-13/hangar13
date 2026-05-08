-- Trainee logbook reads: bypass fragile RLS stacks (same idea as get_session_user_profile).
-- Also replace legacy "Managers and gods can view all logbook entries" (direct public.users
-- subquery) with auth_is_platform_admin() so policy evaluation does not re-enter users RLS.

BEGIN;

CREATE OR REPLACE FUNCTION public.list_my_logbook_entries()
RETURNS SETOF public.logbook_entries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT *
  FROM public.logbook_entries le
  WHERE le.user_id = auth.uid()
  ORDER BY le.entry_date DESC;
$$;

REVOKE ALL ON FUNCTION public.list_my_logbook_entries() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_logbook_entries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_logbook_entries() TO service_role;

COMMENT ON FUNCTION public.list_my_logbook_entries() IS
  'Returns logbook_entries for auth.uid(); bypasses logbook_entries RLS for the trainee read path.';

DROP POLICY IF EXISTS "Managers and gods can view all logbook entries" ON public.logbook_entries;

CREATE POLICY "Platform admins can view all logbook entries"
  ON public.logbook_entries
  FOR SELECT
  TO authenticated
  USING (public.auth_is_platform_admin());

COMMIT;
