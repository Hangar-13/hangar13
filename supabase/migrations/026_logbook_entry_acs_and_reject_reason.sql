-- Add reject_reason to logbook_entries
ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- logbook_entry_acs: stores approved ACS codes for logbook entries (after mentor approval)
CREATE TABLE IF NOT EXISTS public.logbook_entry_acs (
    id SERIAL PRIMARY KEY,
    logbook_entry_id UUID NOT NULL REFERENCES public.logbook_entries(id) ON DELETE CASCADE,
    acs_code_id INTEGER NOT NULL REFERENCES public.acs_code(id),
    UNIQUE (logbook_entry_id, acs_code_id)
);

CREATE INDEX IF NOT EXISTS idx_logbook_entry_acs_logbook_entry_id ON public.logbook_entry_acs(logbook_entry_id);
CREATE INDEX IF NOT EXISTS idx_logbook_entry_acs_acs_code_id ON public.logbook_entry_acs(acs_code_id);

-- RLS: apprentices and mentors can read their own/their apprentices' approved ACS
ALTER TABLE public.logbook_entry_acs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apprentices can read own logbook entry acs"
  ON public.logbook_entry_acs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.logbook_entries le
      JOIN public.apprentices a ON a.id = le.apprentice_id
      WHERE le.id = logbook_entry_acs.logbook_entry_id
        AND a.user_id = auth.uid()
    )
  );

CREATE POLICY "Mentors can read apprentice logbook entry acs"
  ON public.logbook_entry_acs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.logbook_entries le
      JOIN public.apprentices a ON a.id = le.apprentice_id
      WHERE le.id = logbook_entry_acs.logbook_entry_id
        AND a.mentor_id = auth.uid()
    )
  );

-- Mentors need INSERT/DELETE for the approve transaction (via service role or SECURITY DEFINER function)
-- We use a SECURITY DEFINER function so the app can run the transaction with elevated privileges
CREATE OR REPLACE FUNCTION public.approve_logbook_entry(
  p_entry_id UUID,
  p_approver_id UUID,
  p_acs_code_ids INTEGER[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apprentice_id UUID;
  v_mentor_id UUID;
  v_pending RECORD;
BEGIN
  -- Verify mentor permission
  SELECT le.apprentice_id, a.mentor_id INTO v_apprentice_id, v_mentor_id
  FROM logbook_entries le
  JOIN apprentices a ON a.id = le.apprentice_id
  WHERE le.id = p_entry_id;

  IF v_apprentice_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Entry not found');
  END IF;

  IF v_mentor_id != p_approver_id THEN
    RETURN jsonb_build_object('error', 'Permission denied');
  END IF;

  -- Update pending ACS if ids provided (mentor may have edited)
  IF array_length(p_acs_code_ids, 1) > 0 THEN
    DELETE FROM logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;
    INSERT INTO logbook_entry_acs_pending (logbook_entry_id, acs_code_id)
    SELECT p_entry_id, unnest(p_acs_code_ids);
  END IF;

  -- Copy pending to approved
  INSERT INTO logbook_entry_acs (logbook_entry_id, acs_code_id)
  SELECT logbook_entry_id, acs_code_id
  FROM logbook_entry_acs_pending
  WHERE logbook_entry_id = p_entry_id;

  -- Remove from pending
  DELETE FROM logbook_entry_acs_pending WHERE logbook_entry_id = p_entry_id;

  -- Update entry status
  UPDATE logbook_entries
  SET status = 'approved',
      approved_by = p_approver_id,
      approved_at = NOW(),
      reject_reason = NULL
  WHERE id = p_entry_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_logbook_entry(UUID, UUID, INTEGER[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_logbook_entry(UUID, UUID, INTEGER[]) TO service_role;
