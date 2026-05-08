-- Split platform-admin powers from org-scoped supervisor/manager powers.
-- auth_can_manage_orgs_and_memberships() becomes platform-admin-only; org operations use org-scoped helpers.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_is_org_supervisor(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.organization_id = p_org_id
      AND uo.role = 'supervisor'::text
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_org_manager_or_supervisor(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.organization_id = p_org_id
      AND uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text])
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_org_supervisor(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_is_org_manager_or_supervisor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_org_supervisor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_org_manager_or_supervisor(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_org_supervisor(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_is_org_manager_or_supervisor(uuid) TO service_role;

COMMENT ON FUNCTION public.auth_is_org_supervisor(uuid) IS
  'True if caller has organization role supervisor in the given organization.';
COMMENT ON FUNCTION public.auth_is_org_manager_or_supervisor(uuid) IS
  'True if caller has manager or supervisor role in the given organization.';

-- Global directory administration: platform admins only (no cross-org org-role shortcut).
CREATE OR REPLACE FUNCTION public.auth_can_manage_orgs_and_memberships()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.auth_is_platform_admin();
$$;

COMMENT ON FUNCTION public.auth_can_manage_orgs_and_memberships() IS
  'Platform admin/god only. Org supervisors use auth_is_org_supervisor / membership policies scoped by organization_id.';

-- ---------------------------------------------------------------------------
-- users: managers/supervisors can read profiles of users who share an organization with them
-- ---------------------------------------------------------------------------
CREATE POLICY "Org managers and supervisors view co-member profiles"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_organizations my_uo
      INNER JOIN public.user_organizations peer_uo
        ON peer_uo.organization_id = my_uo.organization_id
       AND peer_uo.user_id = users.id
      WHERE my_uo.user_id = auth.uid()
        AND my_uo.role = ANY (ARRAY['manager'::text, 'supervisor'::text])
    )
  );

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Managers and gods can manage organizations" ON public.organizations;

CREATE POLICY "Platform admins manage organizations"
  ON public.organizations
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

-- ---------------------------------------------------------------------------
-- user_organizations
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Managers and gods can view all organization memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Managers and gods can insert organization memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Managers and gods can update organization memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Managers and gods can delete organization memberships" ON public.user_organizations;

CREATE POLICY "Platform admins manage all organization memberships"
  ON public.user_organizations
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

CREATE POLICY "Org managers view memberships in their organizations"
  ON public.user_organizations
  FOR SELECT
  TO authenticated
  USING (public.auth_is_org_manager_or_supervisor(organization_id));

CREATE POLICY "Org supervisors add memberships in their organizations"
  ON public.user_organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.auth_is_org_supervisor(organization_id)
    AND role::text = ANY (ARRAY['student'::text, 'mentor'::text, 'manager'::text])
  );

CREATE POLICY "Org supervisors update memberships in their organizations"
  ON public.user_organizations
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_org_supervisor(organization_id))
  WITH CHECK (
    public.auth_is_org_supervisor(organization_id)
    AND role::text = ANY (ARRAY['student'::text, 'mentor'::text, 'manager'::text])
  );

CREATE POLICY "Org supervisors remove memberships in their organizations"
  ON public.user_organizations
  FOR DELETE
  TO authenticated
  USING (public.auth_is_org_supervisor(organization_id));

-- ---------------------------------------------------------------------------
-- organization_training_entitlements
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Managers and gods can view org training entitlements"
  ON public.organization_training_entitlements;
DROP POLICY IF EXISTS "Managers and gods can manage org training entitlements"
  ON public.organization_training_entitlements;

CREATE POLICY "Platform admin or org managers view org training entitlements"
  ON public.organization_training_entitlements
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_platform_admin()
    OR public.auth_is_org_manager_or_supervisor(organization_id)
  );

CREATE POLICY "Platform admin or org managers manage org training entitlements"
  ON public.organization_training_entitlements
  FOR ALL
  TO authenticated
  USING (
    public.auth_is_platform_admin()
    OR public.auth_is_org_manager_or_supervisor(organization_id)
  )
  WITH CHECK (
    public.auth_is_platform_admin()
    OR public.auth_is_org_manager_or_supervisor(organization_id)
  );

-- ---------------------------------------------------------------------------
-- user_training_access_grants
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Managers and gods read all access grants"
  ON public.user_training_access_grants;
DROP POLICY IF EXISTS "Managers and gods manage access grants"
  ON public.user_training_access_grants;

CREATE POLICY "Platform admin or org managers read access grants for org paths"
  ON public.user_training_access_grants
  FOR SELECT
  TO authenticated
  USING (
    public.auth_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.training_paths tp
      WHERE tp.id = user_training_access_grants.training_path_id
        AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
    )
  );

CREATE POLICY "Platform admin or org managers manage access grants for org paths"
  ON public.user_training_access_grants
  FOR ALL
  TO authenticated
  USING (
    public.auth_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.training_paths tp
      WHERE tp.id = user_training_access_grants.training_path_id
        AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
    )
  )
  WITH CHECK (
    public.auth_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.training_paths tp
      WHERE tp.id = user_training_access_grants.training_path_id
        AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- organization_training_seat_occupancies
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Managers and gods manage seat occupancies"
  ON public.organization_training_seat_occupancies;

CREATE POLICY "Platform admin or org managers manage seat occupancies"
  ON public.organization_training_seat_occupancies
  FOR ALL
  TO authenticated
  USING (
    public.auth_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.organization_training_entitlements e
      WHERE e.id = organization_training_seat_occupancies.organization_training_entitlement_id
        AND public.auth_is_org_manager_or_supervisor(e.organization_id)
    )
  )
  WITH CHECK (
    public.auth_is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.organization_training_entitlements e
      WHERE e.id = organization_training_seat_occupancies.organization_training_entitlement_id
        AND public.auth_is_org_manager_or_supervisor(e.organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- lesson_submissions + files (org-scoped oversight instead of any-org manager)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.lesson_submissions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers and gods can review all lesson submissions" ON public.lesson_submissions;
    DROP POLICY IF EXISTS "Managers and gods can view all lesson submissions" ON public.lesson_submissions;

    CREATE POLICY "Platform admin or org managers review lesson submissions"
      ON public.lesson_submissions
      FOR UPDATE
      TO authenticated
      USING (
        public.auth_is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.user_trainings ut
          INNER JOIN public.training_paths tp ON tp.id = ut.training_path_id
          WHERE ut.id = lesson_submissions.user_training_id
            AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
      );

    CREATE POLICY "Platform admin or org managers view lesson submissions"
      ON public.lesson_submissions
      FOR SELECT
      TO authenticated
      USING (
        public.auth_is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.user_trainings ut
          INNER JOIN public.training_paths tp ON tp.id = ut.training_path_id
          WHERE ut.id = lesson_submissions.user_training_id
            AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
      );
  END IF;

  IF to_regclass('public.lesson_submission_files') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers and gods can view all lesson submission files" ON public.lesson_submission_files;

    CREATE POLICY "Platform admin or org managers view lesson submission files"
      ON public.lesson_submission_files
      FOR SELECT
      TO authenticated
      USING (
        public.auth_is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.lesson_submissions ls
          INNER JOIN public.user_trainings ut ON ut.id = ls.user_training_id
          INNER JOIN public.training_paths tp ON tp.id = ut.training_path_id
          WHERE ls.id = lesson_submission_files.submission_id
            AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- training_path_assignments (if present)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.training_path_assignments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers and gods can view all training_path_assignments" ON public.training_path_assignments;
    DROP POLICY IF EXISTS "Managers and gods insert training_path_assignments" ON public.training_path_assignments;
    DROP POLICY IF EXISTS "Managers and gods update all training_path_assignments" ON public.training_path_assignments;

    CREATE POLICY "Platform admin or org managers view training_path_assignments"
      ON public.training_path_assignments FOR SELECT
      TO authenticated
      USING (
        public.auth_is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.training_paths tp
          WHERE tp.id = training_path_assignments.training_path_id
            AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
      );

    CREATE POLICY "Platform admin or org managers insert training_path_assignments"
      ON public.training_path_assignments FOR INSERT
      TO authenticated
      WITH CHECK (
        public.auth_is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.training_paths tp
          WHERE tp.id = training_path_assignments.training_path_id
            AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
      );

    CREATE POLICY "Platform admin or org managers update training_path_assignments"
      ON public.training_path_assignments FOR UPDATE
      TO authenticated
      USING (
        public.auth_is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.training_paths tp
          WHERE tp.id = training_path_assignments.training_path_id
            AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
      )
      WITH CHECK (
        public.auth_is_platform_admin()
        OR EXISTS (
          SELECT 1 FROM public.training_paths tp
          WHERE tp.id = training_path_assignments.training_path_id
            AND public.auth_is_org_manager_or_supervisor(tp.organization_id)
        )
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- courses SELECT: public visibility branch — platform admins only (not org managers)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Courses visible by visibility enrollability or admin" ON public.courses;

CREATE POLICY "Courses visible by visibility enrollability or admin"
  ON public.courses FOR SELECT
  TO authenticated
  USING (
    public.auth_is_platform_admin()
    OR public.auth_course_reachable_via_enrollment(courses.id)
    OR (
      courses.visibility = 'proprietary'::public.catalog_visibility
      AND EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = courses.organization_id
          AND uo.role = 'mentor'::text
      )
    )
    OR (
      courses.visibility = 'draft'::public.catalog_visibility
      AND courses.created_by IS NOT NULL
      AND courses.created_by = auth.uid()
    )
    OR (
      courses.visibility = 'unreleased'::public.catalog_visibility
      AND (
        (courses.created_by IS NOT NULL AND courses.created_by = auth.uid())
        OR public.auth_org_has_manager_plus(courses.organization_id)
      )
    )
    OR (
      courses.visibility = 'proprietary'::public.catalog_visibility
      AND (
        (courses.created_by IS NOT NULL AND courses.created_by = auth.uid())
        OR public.auth_org_has_manager_plus(courses.organization_id)
      )
    )
    OR (
      courses.visibility = 'public'::public.catalog_visibility
      AND (
        public.auth_is_platform_admin()
        OR public.auth_org_has_manager_plus(courses.organization_id)
      )
    )
  );

COMMIT;
