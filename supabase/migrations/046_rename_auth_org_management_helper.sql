-- Clarify naming: org roles never included "god". This introduces an accurate helper name
-- and keeps auth_has_manager_or_god_in_any_org as a deprecated alias for existing RLS policy text.

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_can_manage_orgs_and_memberships()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_platform_admin()
  OR EXISTS (
    SELECT 1
    FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text])
  );
$$;

REVOKE ALL ON FUNCTION public.auth_can_manage_orgs_and_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_orgs_and_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_manage_orgs_and_memberships() TO service_role;

COMMENT ON FUNCTION public.auth_can_manage_orgs_and_memberships() IS
  'True when caller may administer organizations directory-wide: platform admin/god, or organization manager/supervisor in at least one org.';

CREATE OR REPLACE FUNCTION public.auth_has_manager_or_god_in_any_org()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_can_manage_orgs_and_memberships();
$$;

COMMENT ON FUNCTION public.auth_has_manager_or_god_in_any_org() IS
  'Deprecated name for auth_can_manage_orgs_and_memberships(); retained because older RLS policies reference this identifier. No organization-role “god”.';

COMMIT;
