-- Skills profile: authorized viewers (self, mentor, org staff, platform admin) can load
-- another user's logbook entries for the skills/resume page without fragile RLS stacks.

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_can_view_skills_profile(p_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      auth.uid() = p_target_user_id
      OR public.auth_is_platform_admin()
      OR public.auth_user_trainee_mentor_matches(p_target_user_id, auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.user_trainings ut
        WHERE ut.user_id = p_target_user_id
          AND ut.mentor_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.user_organizations viewer_uo
        INNER JOIN public.user_organizations target_uo
          ON target_uo.organization_id = viewer_uo.organization_id
        WHERE viewer_uo.user_id = auth.uid()
          AND target_uo.user_id = p_target_user_id
          AND viewer_uo.role = ANY (
            ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.auth_can_view_skills_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_can_view_skills_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_skills_profile(uuid) TO service_role;

COMMENT ON FUNCTION public.auth_can_view_skills_profile(uuid) IS
  'Whether auth.uid() may view the skills/resume profile (and logbook) for p_target_user_id.';

CREATE OR REPLACE FUNCTION public.list_logbook_entries_for_skills_profile(p_owner_user_id uuid)
RETURNS SETOF public.logbook_entries
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT le.*
  FROM public.logbook_entries le
  WHERE le.user_id = p_owner_user_id
    AND public.auth_can_view_skills_profile(p_owner_user_id)
  ORDER BY le.entry_date DESC;
$$;

REVOKE ALL ON FUNCTION public.list_logbook_entries_for_skills_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_logbook_entries_for_skills_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_logbook_entries_for_skills_profile(uuid) TO service_role;

COMMENT ON FUNCTION public.list_logbook_entries_for_skills_profile(uuid) IS
  'Logbook rows for skills profile when viewer is authorized; bypasses logbook_entries RLS.';

COMMIT;
