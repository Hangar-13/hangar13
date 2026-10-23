-- Lesson Talent LMS test unit, default-module setup flag, and a god-only
-- "Deleted Lessons" archive used when a manager deletes a module that still
-- has lessons. Published course-version snapshots keep copied fields when the
-- live module is removed (source_module_id becomes null).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Lesson Talent LMS test unit
-- ---------------------------------------------------------------------------
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS talent_lms_test_unit_id text;

COMMENT ON COLUMN public.lessons.talent_lms_test_unit_id IS
  'TalentLMS unit id for this lesson''s test (digits). Same play URL pattern as talent_lms_unit_id.';

ALTER TABLE public.course_version_lessons
  ADD COLUMN IF NOT EXISTS talent_lms_test_unit_id text;

-- ---------------------------------------------------------------------------
-- 2. Module needs-setup flag (converted default modules)
-- ---------------------------------------------------------------------------
ALTER TABLE public.modules
  ADD COLUMN IF NOT EXISTS needs_setup boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.modules.needs_setup IS
  'When true, this module was converted from a default container and still needs a real title (and related details).';

-- ---------------------------------------------------------------------------
-- 3. Deleted-lessons archive course (god-only)
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_deleted_lessons_archive boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.courses.is_deleted_lessons_archive IS
  'Internal per-org archive holding lessons removed with their modules. Visible only to system god users.';

CREATE UNIQUE INDEX IF NOT EXISTS courses_one_deleted_lessons_archive_per_org
  ON public.courses (organization_id)
  WHERE is_deleted_lessons_archive = true;

-- ---------------------------------------------------------------------------
-- 4. Allow deleting live modules that were snapshotted into a course version
-- ---------------------------------------------------------------------------
ALTER TABLE public.course_version_modules
  DROP CONSTRAINT IF EXISTS course_version_modules_source_module_fkey;

ALTER TABLE public.course_version_modules
  ALTER COLUMN source_module_id DROP NOT NULL;

ALTER TABLE public.course_version_modules
  ADD CONSTRAINT course_version_modules_source_module_fkey
    FOREIGN KEY (source_module_id) REFERENCES public.modules(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 5. RLS: archive courses are invisible except to system god
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Courses visible by visibility enrollability or admin" ON public.courses;

CREATE POLICY "Courses visible by visibility enrollability or admin"
  ON public.courses FOR SELECT
  TO authenticated
  USING (
    CASE
      WHEN courses.is_deleted_lessons_archive THEN public.auth_is_system_god()
      ELSE (
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
      )
    END
  );

DROP POLICY IF EXISTS "Org mentors and above can manage courses" ON public.courses;
CREATE POLICY "Org mentors and above can manage courses"
  ON public.courses
  FOR ALL
  USING ((
    NOT courses.is_deleted_lessons_archive
    AND EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = courses.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ))
  WITH CHECK ((
    NOT courses.is_deleted_lessons_archive
    AND EXISTS (
      SELECT 1 FROM public.user_organizations uo
      WHERE uo.user_id = auth.uid()
        AND uo.organization_id = courses.organization_id
        AND uo.role = ANY (
          ARRAY['mentor'::text, 'manager'::text, 'supervisor'::text, 'lead'::text]
        )
    )
  ));

-- ---------------------------------------------------------------------------
-- 6. Delete module: empty modules drop; modules with lessons move those
--    lessons into the org's Deleted Lessons archive, then drop the module.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.manager_delete_course_module(p_module_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_course_id uuid;
  v_org_id uuid;
  v_is_archive boolean;
  v_lesson_count integer;
  v_archive_course_id uuid;
  v_archive_module_id uuid;
  v_next_number integer;
  v_lesson record;
  v_moved integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not signed in.');
  END IF;

  SELECT m.course_id, c.organization_id, COALESCE(c.is_deleted_lessons_archive, false)
    INTO v_course_id, v_org_id, v_is_archive
  FROM public.modules m
  JOIN public.courses c ON c.id = m.course_id
  WHERE m.id = p_module_id;

  IF v_course_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Module not found.');
  END IF;

  IF v_is_archive AND NOT public.auth_is_system_god() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Module not found.');
  END IF;

  IF NOT (
    public.auth_is_platform_admin()
    OR public.auth_org_mentor_plus_for_course(v_course_id)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Module not found.');
  END IF;

  SELECT COUNT(*)::integer INTO v_lesson_count
  FROM public.lessons
  WHERE module_id = p_module_id;

  -- Archive course: drop the module (lessons cascade if any).
  IF v_is_archive THEN
    DELETE FROM public.modules WHERE id = p_module_id;
    RETURN jsonb_build_object('ok', true, 'archived_lesson_count', 0);
  END IF;

  IF v_lesson_count > 0 THEN
    IF v_org_id IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'error', 'Course has no organization; cannot archive lessons.'
      );
    END IF;

    SELECT c.id INTO v_archive_course_id
    FROM public.courses c
    WHERE c.organization_id = v_org_id
      AND c.is_deleted_lessons_archive = true
    LIMIT 1;

    IF v_archive_course_id IS NULL THEN
      INSERT INTO public.courses (
        name,
        description,
        created_by,
        organization_id,
        visibility,
        is_deleted_lessons_archive
      )
      VALUES (
        'Deleted Lessons',
        'Lessons removed from courses. Visible only to Hangar god users.',
        auth.uid(),
        v_org_id,
        'draft',
        true
      )
      RETURNING id INTO v_archive_course_id;
    END IF;

    SELECT m.id INTO v_archive_module_id
    FROM public.modules m
    WHERE m.course_id = v_archive_course_id
    ORDER BY m.number ASC
    LIMIT 1;

    IF v_archive_module_id IS NULL THEN
      INSERT INTO public.modules (
        course_id,
        title,
        description,
        number,
        is_hidden_from_users,
        needs_setup
      )
      VALUES (
        v_archive_course_id,
        'Deleted Lessons',
        NULL,
        0,
        true,
        false
      )
      RETURNING id INTO v_archive_module_id;
    END IF;

    SELECT COALESCE(MAX(l.number), 0) INTO v_next_number
    FROM public.lessons l
    WHERE l.module_id = v_archive_module_id;

    FOR v_lesson IN
      SELECT l.id
      FROM public.lessons l
      WHERE l.module_id = p_module_id
      ORDER BY l.number ASC, l.id ASC
    LOOP
      v_next_number := v_next_number + 1;
      UPDATE public.lessons
      SET module_id = v_archive_module_id,
          number = v_next_number
      WHERE id = v_lesson.id;
      v_moved := v_moved + 1;
    END LOOP;
  END IF;

  DELETE FROM public.modules WHERE id = p_module_id;

  RETURN jsonb_build_object('ok', true, 'archived_lesson_count', v_moved);
END;
$$;

REVOKE ALL ON FUNCTION public.manager_delete_course_module(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.manager_delete_course_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manager_delete_course_module(uuid) TO service_role;

COMMENT ON FUNCTION public.manager_delete_course_module(uuid) IS
  'Deletes a course module. Empty modules are dropped; modules with lessons move those lessons into the org Deleted Lessons archive first.';

COMMIT;
