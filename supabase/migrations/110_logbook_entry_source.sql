-- Where a log entry came from. Prior-experience entries record the work
-- without hours. Coursework is reserved for entries generated from a
-- completed lesson; that generation is not implemented yet.

CREATE TYPE public.logbook_entry_source AS ENUM (
  'manual',
  'prior_exp',
  'coursework'
);

ALTER TABLE public.logbook_entries
  ADD COLUMN source public.logbook_entry_source NOT NULL DEFAULT 'manual';

ALTER TABLE public.logbook_entries
  ADD CONSTRAINT logbook_entries_prior_exp_hours_check
  CHECK (source <> 'prior_exp' OR hours_worked = 0);

COMMENT ON COLUMN public.logbook_entries.source IS
  'manual: written by the student. prior_exp: accepted from prior OJT and stored with 0 hours. coursework: generated when a lesson is completed.';

UPDATE public.logbook_entries le
SET source = 'prior_exp',
    hours_worked = 0
WHERE EXISTS (
  SELECT 1
  FROM public.prior_ojt_proposed_entries p
  WHERE p.logbook_entry_id = le.id
);
