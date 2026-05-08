-- Trainee removes users.mentor_id only when it points at a non-directory (visible = false) mentor row.

BEGIN;

CREATE OR REPLACE FUNCTION public.clear_invisible_assigned_mentor_for_self()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mid uuid;
  v_vis boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT u.mentor_id INTO v_mid
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_mid IS NULL THEN
    RETURN jsonb_build_object('error', 'No mentor assigned');
  END IF;

  SELECT u.visible INTO v_vis
  FROM public.users u
  WHERE u.id = v_mid;

  IF v_vis IS DISTINCT FROM false THEN
    RETURN jsonb_build_object(
      'error',
      'Only external (non-directory) mentors can be removed here.'
    );
  END IF;

  UPDATE public.users
  SET mentor_id = NULL
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.clear_invisible_assigned_mentor_for_self() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_invisible_assigned_mentor_for_self() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_invisible_assigned_mentor_for_self() TO service_role;

COMMENT ON FUNCTION public.clear_invisible_assigned_mentor_for_self() IS
  'Clears auth.uid() users.mentor_id when the assigned mentor row has visible = false.';

COMMIT;
