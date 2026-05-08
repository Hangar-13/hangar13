-- Fix: "Trainees can view their mentor profile" subqueried public.users inside a public.users
-- SELECT policy, which triggers infinite RLS recursion and breaks all profile reads (login → no row).

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_current_user_mentor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT u.mentor_id
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_current_user_mentor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_current_user_mentor_id() TO authenticated;

COMMENT ON FUNCTION public.auth_current_user_mentor_id() IS
  'RLS helper: caller''s users.mentor_id without re-entering users policies.';

DROP POLICY IF EXISTS "Trainees can view their mentor profile" ON public.users;

CREATE POLICY "Trainees can view their mentor profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT ut.mentor_id
      FROM public.user_trainings ut
      WHERE ut.user_id = auth.uid()
        AND ut.mentor_id IS NOT NULL
    )
    OR id = public.auth_current_user_mentor_id()
  );

COMMIT;
