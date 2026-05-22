-- User preference: custom landing path after login (null = role-based default).

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS default_start_path text;

COMMENT ON COLUMN public.users.default_start_path IS
  'Optional relative app path (e.g. /dashboard/student/logbook). When null, middleware uses role-based default dashboard.';

DROP FUNCTION IF EXISTS public.get_session_user_profile();

CREATE FUNCTION public.get_session_user_profile()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  visible boolean,
  last_active_organization_id uuid,
  current_user_training_id uuid,
  current_certification text,
  default_start_path text
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
    u.current_user_training_id,
    u.current_certification::text AS current_certification,
    u.default_start_path
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_session_user_profile() IS
  'Returns at most one row: the caller''s public.users record (auth.uid()), regardless of users RLS.';

REVOKE ALL ON FUNCTION public.get_session_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO service_role;

COMMIT;
