-- Backward-compatible alias: some callers / cached clients still invoke
-- set_current_curriculum_id after migration 075 removed it.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_current_curriculum_id(p_user_training_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.set_current_user_training_id(p_user_training_id);
END;
$$;

COMMENT ON FUNCTION public.set_current_curriculum_id(uuid) IS
  'Deprecated alias for set_current_user_training_id(uuid).';

REVOKE ALL ON FUNCTION public.set_current_curriculum_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_current_curriculum_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_curriculum_id(uuid) TO service_role;

COMMIT;
