-- Exact, case-insensitive email lookup for server-only service role (god org flow).
-- Avoids ilike / maybeSingle edge cases; not granted to anonymous clients.

BEGIN;

CREATE OR REPLACE FUNCTION public.god_find_user_by_email(p_email text)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.full_name, u.email
  FROM public.users u
  WHERE lower(trim(both from u.email::text)) = lower(trim(both from p_email::text))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.god_find_user_by_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.god_find_user_by_email(text) TO service_role;

COMMENT ON FUNCTION public.god_find_user_by_email(text) IS
  'Service-role only: resolve public.users by email (god create-org lookup). Not exposed to anon/auth API when PUBLIC is revoked.';

COMMIT;
