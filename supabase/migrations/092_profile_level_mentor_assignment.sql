-- Make the mentor <-> student relationship a student-level relationship instead
-- of a per-enrollment (training-path) one. The canonical mentor already lives on
-- public.users.mentor_id (048) and propagates to enrollments via triggers; these
-- helpers let the app assign and list mentees by student, independent of whether
-- the student is enrolled in any training path yet.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Assign (or clear) a student's mentor at the profile level.
--    p_mentor_id NULL clears the mentor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_student_mentor(
  p_student_id uuid,
  p_mentor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;
  IF p_student_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Student is required');
  END IF;

  v_is_admin := public.auth_is_platform_admin();

  -- Non-admins must be a mentor-capable member (mentor/manager/supervisor/lead)
  -- of an organization where the target is a student.
  IF NOT v_is_admin THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_organizations me
      JOIN public.user_organizations them
        ON them.organization_id = me.organization_id
      WHERE me.user_id = v_actor
        AND me.role IN ('mentor', 'manager', 'supervisor', 'lead')
        AND them.user_id = p_student_id
        AND them.role = 'student'
    ) THEN
      RETURN jsonb_build_object('error', 'Not a mentor in this student''s organization');
    END IF;

    -- You may only assign yourself as the mentor (clearing is allowed for any
    -- mentor-capable member above).
    IF p_mentor_id IS NOT NULL AND p_mentor_id <> v_actor THEN
      RETURN jsonb_build_object('error', 'You can only assign yourself as the mentor');
    END IF;
  END IF;

  UPDATE public.users
  SET mentor_id = p_mentor_id
  WHERE id = p_student_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Student not found');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.assign_student_mentor(uuid, uuid) IS
  'Sets public.users.mentor_id for a student (profile-level mentor). Caller must be a platform admin or a mentor-capable member of a shared org; non-admins may only assign themselves.';

REVOKE ALL ON FUNCTION public.assign_student_mentor(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_student_mentor(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_student_mentor(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. List the students of an organization (one row per student) with their
--    current mentor, for the "Add Student" picker. Membership-based, so it
--    includes students who are not enrolled in any training path yet.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_org_student_candidates(p_organization_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  mentor_id uuid,
  mentor_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR p_organization_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.auth_is_platform_admin() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.user_organizations uo
      WHERE uo.user_id = v_actor
        AND uo.organization_id = p_organization_id
        AND uo.role IN ('mentor', 'manager', 'supervisor', 'lead')
    ) THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.mentor_id,
    m.full_name AS mentor_name
  FROM public.user_organizations s
  JOIN public.users u ON u.id = s.user_id
  LEFT JOIN public.users m ON m.id = u.mentor_id
  WHERE s.organization_id = p_organization_id
    AND s.role = 'student'
    AND u.visible = true
    AND u.role NOT IN ('admin', 'god')
  ORDER BY u.full_name NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.list_org_student_candidates(uuid) IS
  'Students of an organization (one row per student) with their current mentor, for mentor-capable members or platform admins.';

REVOKE ALL ON FUNCTION public.list_org_student_candidates(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_org_student_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_org_student_candidates(uuid) TO service_role;

COMMIT;
