-- Mentor sign-off on weekly (lesson) submissions: feedback columns + profile-aware mentor RLS.
-- reject_reason mirrors logbook_entries.reject_reason (shown to student on rejection).
-- mentor_notes holds optional mentor feedback left when approving.
-- Mentor review RLS keyed off enrollment_effective_mentor_id (users.mentor_id wins, else enrollment),
-- matching how sign-off and notifications resolve the assigned mentor.

BEGIN;

ALTER TABLE public.lesson_submissions
  ADD COLUMN IF NOT EXISTS reject_reason text,
  ADD COLUMN IF NOT EXISTS mentor_notes text;

COMMENT ON COLUMN public.lesson_submissions.reject_reason IS
  'Mentor feedback shown to the student when a weekly submission is rejected.';
COMMENT ON COLUMN public.lesson_submissions.mentor_notes IS
  'Optional mentor feedback left when approving a weekly submission.';

-- ---------------------------------------------------------------------------
-- Profile-aware mentor RLS for review (replaces enrollment-only policies from 013).
-- Manager view (047) and platform admin update (048) policies are unaffected.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Mentors can view apprentice lesson submissions" ON public.lesson_submissions;
DROP POLICY IF EXISTS "Mentors can review apprentice lesson submissions" ON public.lesson_submissions;

CREATE POLICY "Mentors can view assigned lesson submissions"
  ON public.lesson_submissions FOR SELECT
  TO authenticated
  USING (public.enrollment_effective_mentor_id(user_training_id) = auth.uid());

CREATE POLICY "Mentors can review assigned lesson submissions"
  ON public.lesson_submissions FOR UPDATE
  TO authenticated
  USING (public.enrollment_effective_mentor_id(user_training_id) = auth.uid())
  WITH CHECK (public.enrollment_effective_mentor_id(user_training_id) = auth.uid());

DROP POLICY IF EXISTS "Mentors can view mentee lesson submission files" ON public.lesson_submission_files;

CREATE POLICY "Mentors can view assigned lesson submission files"
  ON public.lesson_submission_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lesson_submissions ls
      WHERE ls.id = lesson_submission_files.submission_id
        AND public.enrollment_effective_mentor_id(ls.user_training_id) = auth.uid()
    )
  );

COMMIT;
