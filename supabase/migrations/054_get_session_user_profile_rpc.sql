-- Stable read of the signed-in user's row without going through PostgREST RLS on public.users
-- (policies on users can recurse or overlap and hide the caller's own row).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_session_user_profile()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  visible boolean,
  last_active_organization_id uuid,
  current_curriculum_id uuid,
  current_certification text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.role,
    u.visible,
    u.last_active_organization_id,
    u.current_curriculum_id,
    u.current_certification::text AS current_certification
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_session_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO service_role;

COMMENT ON FUNCTION public.get_session_user_profile() IS
  'Returns at most one row: the caller''s public.users record (auth.uid()), regardless of users RLS.';

COMMIT;
