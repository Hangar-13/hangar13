-- Avoid public.users RLS during active-training switches: direct UPDATE evaluates every
-- FOR UPDATE policy and can still hit 42P17 if any helper/policy stack misbehaves.
-- Same pattern as get_session_user_profile: SECURITY DEFINER + row_security off, with
-- authorization enforced inside the function.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_current_curriculum_id(p_user_training_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.'
      USING ERRCODE = '28000';
  END IF;

  SELECT ut.status
  INTO v_status
  FROM public.user_trainings ut
  WHERE ut.id = p_user_training_id
    AND ut.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'completed'::text THEN
    RAISE EXCEPTION 'Completed training cannot be set as current.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.users u
  SET current_curriculum_id = p_user_training_id
  WHERE u.id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_current_curriculum_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_current_curriculum_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_curriculum_id(uuid) TO service_role;

COMMENT ON FUNCTION public.set_current_curriculum_id(uuid) IS
  'Sets users.current_curriculum_id for auth.uid() after validating enrollment; bypasses users RLS.';

COMMIT;
