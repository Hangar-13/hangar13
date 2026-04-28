-- RLS policy expressions on public.users must NOT subquery public.users, or
-- Postgres re-evaluates RLS and can error / recurse, breaking *all* row reads
-- (including "own" profile" and navigation). Use SECURITY DEFINER to read
-- auth.uid()'s role once without re-entering RLS.

BEGIN;

-- Drop the broken policy from 034/035 (scalar subquery still touches public.users
-- under RLS during evaluation).
DROP POLICY IF EXISTS "System god can read all user rows" ON public.users;

CREATE OR REPLACE FUNCTION public.auth_is_system_god()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'god'::text
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_system_god() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_system_god() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_system_god() TO service_role;

COMMENT ON FUNCTION public.auth_is_system_god() IS
  'Used in RLS only; definer read bypasses RLS for the self row check.';

CREATE POLICY "System god can read all user rows"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (public.auth_is_system_god());

COMMIT;
