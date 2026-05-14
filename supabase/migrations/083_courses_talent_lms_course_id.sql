-- Talent LMS course id lives on Hangar catalog courses (not training_paths).

BEGIN;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS talent_lms_course_id text;

COMMENT ON COLUMN public.courses.talent_lms_course_id IS
  'Talent LMS course id (numeric string). Used with lesson unit ids and TALENTLMS_API_KEY for progress and checkout enrollment.';

-- Backfill pre–migration 041: singleton enrollment wrapper paths (`enrollment_source_course_id`).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_paths'
      AND column_name = 'enrollment_source_course_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_paths'
      AND column_name = 'talent_lms_course_id'
  ) THEN
    UPDATE public.courses c
    SET talent_lms_course_id = btrim(tp.talent_lms_course_id)
    FROM public.training_paths tp
    WHERE tp.enrollment_source_course_id = c.id
      AND tp.talent_lms_course_id IS NOT NULL
      AND btrim(tp.talent_lms_course_id) <> ''
      AND (c.talent_lms_course_id IS NULL OR btrim(c.talent_lms_course_id) = '');
  END IF;
END $$;

-- Backfill post–migration 041: no `enrollment_source_course_id`; copy from paths where
-- path maps directly to a course row (`training_path_items.course_id`) and Talent IDs agree.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_paths'
      AND column_name = 'enrollment_source_course_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_paths'
      AND column_name = 'talent_lms_course_id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'training_path_items'
      AND column_name = 'course_id'
  ) THEN
    UPDATE public.courses c
    SET talent_lms_course_id = sub.talent_id
    FROM (
      SELECT
        tpi.course_id AS cid,
        MIN(btrim(tp.talent_lms_course_id)) AS talent_id
      FROM public.training_paths tp
      INNER JOIN public.training_path_items tpi ON tpi.training_path_id = tp.id
      WHERE tp.talent_lms_course_id IS NOT NULL
        AND btrim(tp.talent_lms_course_id) <> ''
        AND tpi.course_id IS NOT NULL
      GROUP BY tpi.course_id
      HAVING COUNT(DISTINCT btrim(tp.talent_lms_course_id)) = 1
    ) sub
    WHERE c.id = sub.cid
      AND (c.talent_lms_course_id IS NULL OR btrim(c.talent_lms_course_id) = '');
  END IF;
END $$;

ALTER TABLE public.training_paths
  DROP COLUMN IF EXISTS talent_lms_course_id;

COMMIT;
