-- Tight RLS for catalog visibility and enrollment reachability.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers: org membership + training path visibility
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_org_has_any_member(p_org_id uuid)
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
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_org_has_manager_plus(p_org_id uuid)
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
      AND uo.role = ANY (ARRAY['manager'::text, 'admin'::text])
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_can_view_training_path(
  p_organization_id uuid,
  p_visibility public.catalog_visibility,
  p_created_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.auth_is_platform_admin()
    OR (
      p_visibility = 'public'::public.catalog_visibility
      AND auth.role() = 'authenticated'::text
    )
    OR (
      p_visibility = 'proprietary'::public.catalog_visibility
      AND public.auth_org_has_any_member(p_organization_id)
    )
    OR (
      p_visibility = 'unreleased'::public.catalog_visibility
      AND public.auth_org_has_manager_plus(p_organization_id)
    )
    OR (
      p_visibility = 'draft'::public.catalog_visibility
      AND (
        p_created_by IS NOT NULL AND p_created_by = auth.uid()
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.auth_course_reachable_via_enrollment(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_trainings ut
    JOIN public.training_path_items tpi ON tpi.training_path_id = ut.training_path_id
    WHERE ut.user_id = auth.uid()
      AND (
        tpi.course_id = p_course_id
        OR EXISTS (
          SELECT 1 FROM public.modules m
          WHERE m.id = tpi.module_id AND m.course_id = p_course_id
        )
        OR EXISTS (
          SELECT 1 FROM public.lessons l
          INNER JOIN public.modules m ON m.id = l.module_id
          WHERE l.id = tpi.lesson_id AND m.course_id = p_course_id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_lesson_reachable_via_enrollment(p_lesson_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_trainings ut
    JOIN public.training_path_items tpi ON tpi.training_path_id = ut.training_path_id
    INNER JOIN public.lessons les ON les.id = p_lesson_id
    INNER JOIN public.modules mod ON mod.id = les.module_id
    WHERE ut.user_id = auth.uid()
      AND (
        tpi.lesson_id = les.id
        OR tpi.module_id = les.module_id
        OR tpi.course_id = mod.course_id
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_module_reachable_via_enrollment(p_module_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_trainings ut
    JOIN public.training_path_items tpi ON tpi.training_path_id = ut.training_path_id
    INNER JOIN public.modules mod ON mod.id = p_module_id
    WHERE ut.user_id = auth.uid()
      AND (
        tpi.module_id = mod.id
        OR tpi.course_id = mod.course_id
        OR EXISTS (
          SELECT 1 FROM public.lessons l
          WHERE l.module_id = mod.id AND tpi.lesson_id = l.id
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_org_mentor_plus_for_course(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    INNER JOIN public.courses c ON c.organization_id = uo.organization_id
    WHERE c.id = p_course_id
      AND uo.user_id = auth.uid()
      AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'admin'::text])
  );
$$;

REVOKE ALL ON FUNCTION public.auth_org_has_any_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_org_has_manager_plus(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_view_training_path(uuid, public.catalog_visibility, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_course_reachable_via_enrollment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_lesson_reachable_via_enrollment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_module_reachable_via_enrollment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_org_mentor_plus_for_course(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_org_has_any_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_org_has_manager_plus(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_can_view_training_path(uuid, public.catalog_visibility, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_course_reachable_via_enrollment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_lesson_reachable_via_enrollment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_module_reachable_via_enrollment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_org_mentor_plus_for_course(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_org_has_any_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_org_has_manager_plus(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_can_view_training_path(uuid, public.catalog_visibility, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_course_reachable_via_enrollment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_lesson_reachable_via_enrollment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_module_reachable_via_enrollment(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.auth_org_mentor_plus_for_course(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- courses SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view courses" ON public.courses;

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
        public.auth_has_manager_or_god_in_any_org()
        OR public.auth_org_has_manager_plus(courses.organization_id)
      )
    )
  );

-- ---------------------------------------------------------------------------
-- training_paths SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view training_paths" ON public.training_paths;

CREATE POLICY "Training paths visible by visibility rules"
  ON public.training_paths FOR SELECT
  TO authenticated
  USING (
    public.auth_can_view_training_path(
      training_paths.organization_id,
      training_paths.visibility,
      training_paths.created_by
    )
  );

-- ---------------------------------------------------------------------------
-- training_path_items SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view training_path_items" ON public.training_path_items;

CREATE POLICY "Training path items if path visible or enrolled"
  ON public.training_path_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.training_paths tp
      WHERE tp.id = training_path_items.training_path_id
        AND (
          public.auth_can_view_training_path(
            tp.organization_id,
            tp.visibility,
            tp.created_by
          )
          OR EXISTS (
            SELECT 1 FROM public.user_trainings ut
            WHERE ut.training_path_id = tp.id
              AND ut.user_id = auth.uid()
          )
        )
    )
  );

-- ---------------------------------------------------------------------------
-- modules SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view modules" ON public.modules;

CREATE POLICY "Modules visible via enrollment mentor or manager authoring"
  ON public.modules FOR SELECT
  TO authenticated
  USING (
    public.auth_is_platform_admin()
    OR public.auth_module_reachable_via_enrollment(modules.id)
    OR public.auth_org_mentor_plus_for_course(modules.course_id)
  );

-- ---------------------------------------------------------------------------
-- lessons SELECT
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view lessons" ON public.lessons;

CREATE POLICY "Lessons visible via enrollment mentor or manager authoring"
  ON public.lessons FOR SELECT
  TO authenticated
  USING (
    public.auth_is_platform_admin()
    OR public.auth_lesson_reachable_via_enrollment(lessons.id)
    OR EXISTS (
      SELECT 1 FROM public.modules m
      WHERE m.id = lessons.module_id
        AND public.auth_org_mentor_plus_for_course(m.course_id)
    )
  );

COMMIT;
