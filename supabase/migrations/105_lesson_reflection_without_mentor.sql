-- Weekly reflections can be submitted with no assigned mentor.
-- Logbook sign-off is unchanged; that trigger was already removed in 051.

BEGIN;

CREATE OR REPLACE FUNCTION public.assert_enrollment_has_mentor_for_submit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_submissions_require_mentor_submit
  ON public.lesson_submissions;

COMMENT ON FUNCTION public.assert_enrollment_has_mentor_for_submit() IS
  'No longer blocks lesson reflections. Kept so older trigger definitions stay valid.';

COMMIT;
