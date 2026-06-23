-- Refine profile-level mentor assignment authorization:
--   * Picking up a student who has NO mentor: any mentor-capable org member.
--   * Reassigning a student who already has a DIFFERENT mentor: supervisor/lead
--     (or platform admin) only.
--   * Clearing a mentor: the student's current mentor (self-removal), a
--     supervisor/lead, or a platform admin.

BEGIN;

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
  v_can_mentor boolean;
  v_can_supervise boolean;
  v_current_mentor uuid;
  v_found boolean;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;
  IF p_student_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Student is required');
  END IF;

  SELECT u.mentor_id, true INTO v_current_mentor, v_found
  FROM public.users u
  WHERE u.id = p_student_id;

  IF NOT COALESCE(v_found, false) THEN
    RETURN jsonb_build_object('error', 'Student not found');
  END IF;

  v_is_admin := public.auth_is_platform_admin();

  -- Mentor-capable member of an org where the target is a student.
  v_can_mentor := EXISTS (
    SELECT 1
    FROM public.user_organizations me
    JOIN public.user_organizations them
      ON them.organization_id = me.organization_id
    WHERE me.user_id = v_actor
      AND me.role IN ('mentor', 'manager', 'supervisor', 'lead')
      AND them.user_id = p_student_id
      AND them.role = 'student'
  );

  -- Supervisor-capable member of an org where the target is a student.
  v_can_supervise := EXISTS (
    SELECT 1
    FROM public.user_organizations me
    JOIN public.user_organizations them
      ON them.organization_id = me.organization_id
    WHERE me.user_id = v_actor
      AND me.role IN ('supervisor', 'lead')
      AND them.user_id = p_student_id
      AND them.role = 'student'
  );

  IF NOT v_is_admin THEN
    IF p_mentor_id IS NULL THEN
      -- Clearing: current mentor (self-removal) or a supervisor.
      IF NOT (v_can_supervise OR v_current_mentor = v_actor) THEN
        RETURN jsonb_build_object('error', 'Permission denied');
      END IF;
    ELSE
      -- Assigning: you may only assign yourself, and must be mentor-capable.
      IF p_mentor_id <> v_actor THEN
        RETURN jsonb_build_object('error', 'You can only assign yourself as the mentor');
      END IF;
      IF NOT v_can_mentor THEN
        RETURN jsonb_build_object('error', 'Not a mentor in this student''s organization');
      END IF;
      -- Reassigning away from another mentor requires supervisor authority.
      IF v_current_mentor IS NOT NULL
         AND v_current_mentor <> v_actor
         AND NOT v_can_supervise THEN
        RETURN jsonb_build_object(
          'error',
          'Only a supervisor can reassign a student who already has a mentor'
        );
      END IF;
    END IF;
  END IF;

  UPDATE public.users
  SET mentor_id = p_mentor_id
  WHERE id = p_student_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

COMMENT ON FUNCTION public.assign_student_mentor(uuid, uuid) IS
  'Sets public.users.mentor_id. Pick up an unmentored student: any mentor-capable member. Reassign an already-mentored student: supervisor/lead or platform admin. Clear: current mentor, supervisor/lead, or platform admin.';

COMMIT;
