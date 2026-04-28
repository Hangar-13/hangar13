-- Lessons: ACS codes this lesson covers (references acs_code.id).
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS acs_codes integer[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.lessons.acs_codes IS 'Row ids in acs_code for ACS standards this lesson covers.';

CREATE INDEX IF NOT EXISTS idx_lessons_acs_codes ON public.lessons USING gin (acs_codes);
