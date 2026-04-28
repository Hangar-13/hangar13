-- When the student submits for signature, record the time (separate from updated_at on later edits in other flows)
ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

UPDATE public.logbook_entries
SET submitted_at = COALESCE(approved_at, updated_at)
WHERE status IN ('submitted', 'approved', 'rejected')
  AND submitted_at IS NULL;
