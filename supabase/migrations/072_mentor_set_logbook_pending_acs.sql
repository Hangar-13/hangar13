-- Allow mentors to replace pending ACS codes on submitted log lines (RLS only allows SELECT on pending for mentors).

BEGIN;

CREATE OR REPLACE FUNCTION public.mentor_set_logbook_entry_pending_acs(
  p_entry_id uuid,
  p_acs_code_ids integer[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_expected_mentor uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  SELECT le.user_id,
    public.trainee_effective_mentor_id(le.user_id)
  INTO v_owner, v_expected_mentor
  FROM public.logbook_entries le
  WHERE le.id = p_entry_id;

  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  IF v_expected_mentor IS NULL OR v_expected_mentor <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'Permission denied');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.logbook_entries le
    WHERE le.id = p_entry_id
      AND le.status = 'submitted'
  ) THEN
    RETURN jsonb_build_object('error', 'Entry is not awaiting signature');
  END IF;

  DELETE FROM public.logbook_entry_acs_pending
  WHERE logbook_entry_id = p_entry_id;

  IF cardinality(coalesce(p_acs_code_ids, '{}'::integer[])) > 0 THEN
    INSERT INTO public.logbook_entry_acs_pending (logbook_entry_id, acs_code_id)
    SELECT p_entry_id, u
    FROM (
      SELECT DISTINCT unnest(p_acs_code_ids) AS u
    ) s
    WHERE EXISTS (SELECT 1 FROM public.acs_code ac WHERE ac.id = s.u);
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.mentor_set_logbook_entry_pending_acs(uuid, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mentor_set_logbook_entry_pending_acs(uuid, integer[]) TO authenticated;

COMMENT ON FUNCTION public.mentor_set_logbook_entry_pending_acs(uuid, integer[]) IS
  'Mentor-only: replace logbook_entry_acs_pending for a submitted entry before signature.';

COMMIT;
