-- Snapshot TalentLMS unit completion when learners submit weekly reflections (optional columns).

ALTER TABLE public.lesson_submissions
  ADD COLUMN IF NOT EXISTS talent_lms_unit_completed boolean;

ALTER TABLE public.lesson_submissions
  ADD COLUMN IF NOT EXISTS talent_lms_completion_checked_at timestamptz;

ALTER TABLE public.lesson_submissions
  ADD COLUMN IF NOT EXISTS talent_lms_completion_meta jsonb;

COMMENT ON COLUMN public.lesson_submissions.talent_lms_unit_completed IS
  'When set: Talent API confirmed unit completion (true) or verified incomplete (false). NULL when verification was skipped or unavailable.';

COMMENT ON COLUMN public.lesson_submissions.talent_lms_completion_checked_at IS
  'Server timestamp when Talent completion was last verified for this submission row.';

COMMENT ON COLUMN public.lesson_submissions.talent_lms_completion_meta IS
  'Optional JSON: course_id, unit_id, skip_reason, talent payload snippet, etc.';
