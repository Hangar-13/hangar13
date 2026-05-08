-- "Mentors can view all apprentice logbook entries for assignment" (legacy from 003) still used
-- EXISTS (SELECT … FROM public.users u WHERE u.id = auth.uid() AND u.role = 'mentor').
-- That re-enters users RLS; "Users can view reviewers …" then SELECTs logbook_entries again → 42P17.

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_session_user_role_is_mentor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'mentor'::text
  );
$$;

REVOKE ALL ON FUNCTION public.auth_session_user_role_is_mentor() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_session_user_role_is_mentor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_session_user_role_is_mentor() TO service_role;

COMMENT ON FUNCTION public.auth_session_user_role_is_mentor() IS
  'RLS helper: users.role = mentor for auth.uid() without re-entering users policies.';

DROP POLICY IF EXISTS "Mentors can view all apprentice logbook entries for assignment" ON public.logbook_entries;

CREATE POLICY "Mentors can view all apprentice logbook entries for assignment"
  ON public.logbook_entries
  FOR SELECT
  TO authenticated
  USING (public.auth_session_user_role_is_mentor());

COMMIT;
