-- Prior OJT review starts with no hours, and the student may enter hours.
-- A submitted reflection records one coursework log entry.

ALTER TABLE public.logbook_entries
  DROP CONSTRAINT IF EXISTS logbook_entries_prior_exp_hours_check;

ALTER TABLE public.prior_ojt_proposed_entries
  ALTER COLUMN hours_worked SET DEFAULT 0;

ALTER TABLE public.prior_ojt_proposed_entries
  DROP CONSTRAINT IF EXISTS prior_ojt_proposed_entries_hours_check;

ALTER TABLE public.prior_ojt_proposed_entries
  ADD CONSTRAINT prior_ojt_proposed_entries_hours_check
  CHECK (hours_worked >= 0);

UPDATE public.prior_ojt_proposed_entries
SET hours_worked = 0
WHERE status <> 'accepted';

ALTER TABLE public.lesson_submissions
  ADD COLUMN IF NOT EXISTS logbook_entry_id uuid;

ALTER TABLE public.lesson_submissions
  DROP CONSTRAINT IF EXISTS lesson_submissions_logbook_entry_id_fkey;

ALTER TABLE public.lesson_submissions
  ADD CONSTRAINT lesson_submissions_logbook_entry_id_fkey
  FOREIGN KEY (logbook_entry_id) REFERENCES public.logbook_entries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS lesson_submissions_logbook_entry_id_key
  ON public.lesson_submissions (logbook_entry_id)
  WHERE logbook_entry_id IS NOT NULL;

COMMENT ON COLUMN public.lesson_submissions.logbook_entry_id IS
  'Coursework log entry created when this reflection was submitted. Resubmitting updates that draft instead of adding another.';
