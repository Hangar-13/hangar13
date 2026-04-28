-- Training catalog write access: mentor+ in the owning organization. Manager-style ops that are not org-scoped use manager/god in any org.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helpers: any-org elevated roles (assignments, submissions review, etc.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_has_manager_or_god_in_any_org()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations uo
    WHERE uo.user_id = auth.uid()
      AND uo.role = ANY (ARRAY['manager'::text, 'god'::text])
  );
$$;

-- ---------------------------------------------------------------------------
-- courses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view training plans" ON public.courses;
DROP POLICY IF EXISTS "Mentors and above can manage training plans" ON public.courses;

CREATE POLICY "Authenticated users can view courses"
    ON public.courses FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Org mentors and above can manage courses"
    ON public.courses
    FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = courses.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = courses.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ));

-- ---------------------------------------------------------------------------
-- modules (org via course)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view modules" ON public.modules;
DROP POLICY IF EXISTS "Mentors and above can manage modules" ON public.modules;

CREATE POLICY "Authenticated users can view modules"
    ON public.modules FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Org mentors and above can manage modules"
    ON public.modules
    FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.courses c ON c.id = modules.course_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = c.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.courses c ON c.id = modules.course_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = c.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ));

-- ---------------------------------------------------------------------------
-- lessons (org via module -> course)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view training plan weeks" ON public.lessons;
DROP POLICY IF EXISTS "Mentors and above can manage training plan weeks" ON public.lessons;

CREATE POLICY "Authenticated users can view lessons"
    ON public.lessons FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Org mentors and above can manage lessons"
    ON public.lessons
    FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.modules m ON m.id = lessons.module_id
        JOIN public.courses c ON c.id = m.course_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = c.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.modules m ON m.id = lessons.module_id
        JOIN public.courses c ON c.id = m.course_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = c.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ));

-- ---------------------------------------------------------------------------
-- training_paths
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view training_paths" ON public.training_paths;
DROP POLICY IF EXISTS "Mentors and above can manage training_paths" ON public.training_paths;

CREATE POLICY "Authenticated users can view training_paths"
    ON public.training_paths FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Org mentors and above can manage training_paths"
    ON public.training_paths
    FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = training_paths.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = training_paths.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ));

-- ---------------------------------------------------------------------------
-- training_path_items (org via training_path)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view training_path_items" ON public.training_path_items;
DROP POLICY IF EXISTS "Mentors and above can manage training_path_items" ON public.training_path_items;

CREATE POLICY "Authenticated users can view training_path_items"
    ON public.training_path_items FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Org mentors and above can manage training_path_items"
    ON public.training_path_items
    FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.training_paths tp ON tp.id = training_path_items.training_path_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = tp.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.user_organizations uo
        JOIN public.training_paths tp ON tp.id = training_path_items.training_path_id
        WHERE uo.user_id = auth.uid()
          AND uo.organization_id = tp.organization_id
          AND uo.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ));

-- ---------------------------------------------------------------------------
-- organizations + user_organizations admin (manager/god in any org)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Mentors and above can manage organizations" ON public.organizations;

CREATE POLICY "Managers and gods can manage organizations"
    ON public.organizations
    FOR ALL
    USING ((public.auth_has_manager_or_god_in_any_org()))
    WITH CHECK ((public.auth_has_manager_or_god_in_any_org()));

DROP POLICY IF EXISTS "Managers and gods can view all organization memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Managers and gods can insert organization memberships" ON public.user_organizations;
DROP POLICY IF EXISTS "Managers and gods can delete organization memberships" ON public.user_organizations;

CREATE POLICY "Managers and gods can view all organization memberships"
    ON public.user_organizations FOR SELECT
    USING ((public.auth_has_manager_or_god_in_any_org()));

CREATE POLICY "Managers and gods can insert organization memberships"
    ON public.user_organizations FOR INSERT
    TO authenticated
    WITH CHECK ((public.auth_has_manager_or_god_in_any_org()));

CREATE POLICY "Managers and gods can update organization memberships"
    ON public.user_organizations FOR UPDATE
    TO authenticated
    USING ((public.auth_has_manager_or_god_in_any_org()))
    WITH CHECK ((public.auth_has_manager_or_god_in_any_org()));

CREATE POLICY "Managers and gods can delete organization memberships"
    ON public.user_organizations FOR DELETE
    TO authenticated
    USING ((public.auth_has_manager_or_god_in_any_org()));

-- ---------------------------------------------------------------------------
-- training_path_assignments (manager/god in any org) — table may be absent on older DBs
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.training_path_assignments') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers and gods can view all training_path_assignments" ON public.training_path_assignments;
    DROP POLICY IF EXISTS "Managers and gods insert training_path_assignments" ON public.training_path_assignments;
    DROP POLICY IF EXISTS "Managers and gods update all training_path_assignments" ON public.training_path_assignments;

    CREATE POLICY "Managers and gods can view all training_path_assignments"
        ON public.training_path_assignments FOR SELECT
        USING ((public.auth_has_manager_or_god_in_any_org()));

    CREATE POLICY "Managers and gods insert training_path_assignments"
        ON public.training_path_assignments FOR INSERT
        TO authenticated
        WITH CHECK ((public.auth_has_manager_or_god_in_any_org()));

    CREATE POLICY "Managers and gods update all training_path_assignments"
        ON public.training_path_assignments FOR UPDATE
        USING ((public.auth_has_manager_or_god_in_any_org()))
        WITH CHECK ((public.auth_has_manager_or_god_in_any_org()));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- lesson_submissions + files (manager/god in any org for oversight)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.lesson_submissions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers and gods can review all lesson submissions" ON public.lesson_submissions;
    DROP POLICY IF EXISTS "Managers and gods can view all lesson submissions" ON public.lesson_submissions;

    CREATE POLICY "Managers and gods can review all lesson submissions"
        ON public.lesson_submissions FOR UPDATE
        USING ((public.auth_has_manager_or_god_in_any_org()));

    CREATE POLICY "Managers and gods can view all lesson submissions"
        ON public.lesson_submissions FOR SELECT
        USING ((public.auth_has_manager_or_god_in_any_org()));
  END IF;

  IF to_regclass('public.lesson_submission_files') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Managers and gods can view all lesson submission files" ON public.lesson_submission_files;

    CREATE POLICY "Managers and gods can view all lesson submission files"
        ON public.lesson_submission_files FOR SELECT
        USING ((public.auth_has_manager_or_god_in_any_org()));
  END IF;
END $$;

GRANT UPDATE ON public.user_organizations TO authenticated;

COMMIT;
