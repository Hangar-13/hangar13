-- Remove singleton wrapper metadata and the trigger that created a training path on every course insert.

BEGIN;

DROP TRIGGER IF EXISTS trg_courses_singleton_enrollment_path ON public.courses;

DROP FUNCTION IF EXISTS public.trg_courses_create_singleton_enrollment_path();

ALTER TABLE public.training_paths
  DROP CONSTRAINT IF EXISTS training_paths_enrollment_source_course_id_fkey;

DROP INDEX IF EXISTS uq_training_paths_enrollment_source_course_id;

ALTER TABLE public.training_paths
  DROP COLUMN IF EXISTS enrollment_source_course_id;

COMMENT ON COLUMN public.user_trainings.training_path_id IS
  'Enrollment targets a training path.';

COMMENT ON TABLE public.organization_training_entitlements IS
  'Per-org seat purchase for a training path.';

COMMIT;
