-- Enrollments are always tied to training_paths. Courses are content; canonical
-- "singleton" paths (enrollment_source_course_id) wrap a single course for enrollment.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. training_paths: canonical wrapper per course (optional column)
-- ---------------------------------------------------------------------------
ALTER TABLE public.training_paths
  ADD COLUMN IF NOT EXISTS enrollment_source_course_id uuid;

COMMENT ON COLUMN public.training_paths.enrollment_source_course_id IS
  'When set, this path exists solely to enroll in that course (single training_path_items row referencing the course). At most one path per course.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'training_paths_enrollment_source_course_id_fkey'
  ) THEN
    ALTER TABLE public.training_paths
      ADD CONSTRAINT training_paths_enrollment_source_course_id_fkey
      FOREIGN KEY (enrollment_source_course_id)
      REFERENCES public.courses(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_paths_enrollment_source_course_id
  ON public.training_paths (enrollment_source_course_id)
  WHERE enrollment_source_course_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Singleton enrollment paths for every course (Find Training / FK targets)
-- ---------------------------------------------------------------------------
INSERT INTO public.training_paths (
  name,
  description,
  organization_id,
  created_by,
  is_active,
  enrollment_source_course_id
)
SELECT
  c.name,
  c.description,
  c.organization_id,
  c.created_by,
  c.is_active,
  c.id
FROM public.courses c
WHERE NOT EXISTS (
  SELECT 1
  FROM public.training_paths tp
  WHERE tp.enrollment_source_course_id = c.id
);

INSERT INTO public.training_path_items (
  training_path_id,
  course_id,
  sort_order
)
SELECT
  tp.id,
  tp.enrollment_source_course_id,
  0
FROM public.training_paths tp
WHERE tp.enrollment_source_course_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.training_path_items tpi
    WHERE tpi.training_path_id = tp.id
  );

-- Refresh cached hours for new paths
DO $recalc$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT id FROM public.training_paths WHERE enrollment_source_course_id IS NOT NULL
  LOOP
    PERFORM public.recalculate_training_path_total_hours(p.id);
  END LOOP;
END
$recalc$;

-- ---------------------------------------------------------------------------
-- 3. user_trainings: point course enrollments at wrapper paths
-- ---------------------------------------------------------------------------
-- Drop XOR check before UPDATE: rows may temporarily have both course_id and
-- training_path_id set until course_id is dropped.
ALTER TABLE public.user_trainings DROP CONSTRAINT IF EXISTS user_trainings_course_or_path_exclusive;

UPDATE public.user_trainings ut
SET training_path_id = tp.id
FROM public.training_paths tp
WHERE ut.course_id IS NOT NULL
  AND tp.enrollment_source_course_id = ut.course_id;

ALTER TABLE public.user_trainings DROP CONSTRAINT IF EXISTS user_trainings_course_id_fkey;

DROP INDEX IF EXISTS idx_user_trainings_course_id;

ALTER TABLE public.user_trainings DROP COLUMN IF EXISTS course_id;

ALTER TABLE public.user_trainings ALTER COLUMN training_path_id SET NOT NULL;

COMMENT ON COLUMN public.user_trainings.training_path_id IS
  'Enrollment targets a training path (including singleton course wrappers).';

-- ---------------------------------------------------------------------------
-- 4. organization_training_entitlements: training_path_id only
-- ---------------------------------------------------------------------------
UPDATE public.organization_training_entitlements e
SET training_path_id = tp.id,
    course_id = NULL
FROM public.training_paths tp
WHERE e.course_id IS NOT NULL
  AND tp.enrollment_source_course_id = e.course_id;

WITH agg AS (
  SELECT
    organization_id,
    training_path_id,
    SUM(licenses_purchased)::integer AS lic_sum,
    MAX(expires_at) AS exp_max,
    MIN(id::text)::uuid AS keeper_id,
    COUNT(*)::integer AS cnt
  FROM public.organization_training_entitlements
  GROUP BY organization_id, training_path_id
)
UPDATE public.organization_training_entitlements e
SET
  licenses_purchased = agg.lic_sum,
  expires_at = agg.exp_max
FROM agg
WHERE e.id = agg.keeper_id
  AND agg.cnt > 1;

WITH agg AS (
  SELECT
    organization_id,
    training_path_id,
    MIN(id::text)::uuid AS keeper_id,
    COUNT(*)::integer AS cnt
  FROM public.organization_training_entitlements
  GROUP BY organization_id, training_path_id
)
DELETE FROM public.organization_training_entitlements e
USING agg
WHERE agg.cnt > 1
  AND e.organization_id = agg.organization_id
  AND e.training_path_id = agg.training_path_id
  AND e.id <> agg.keeper_id;

ALTER TABLE public.organization_training_entitlements
  DROP CONSTRAINT IF EXISTS organization_training_entitlements_course_id_fkey;

ALTER TABLE public.organization_training_entitlements DROP COLUMN IF EXISTS course_id;

ALTER TABLE public.organization_training_entitlements
  DROP CONSTRAINT IF EXISTS organization_training_entitlements_one_target;

ALTER TABLE public.organization_training_entitlements
  ADD CONSTRAINT organization_training_entitlements_training_path_required
  CHECK (training_path_id IS NOT NULL);

DROP INDEX IF EXISTS uq_organization_training_entitlements_org_course;

COMMENT ON TABLE public.organization_training_entitlements IS
  'Per-org seat purchase for a training path (including singleton course wrappers).';

-- ---------------------------------------------------------------------------
-- 5. Future courses: auto-create singleton enrollment path + single item
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_courses_create_singleton_enrollment_path()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_path_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.training_paths tp
    WHERE tp.enrollment_source_course_id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.training_paths (
    name,
    description,
    organization_id,
    created_by,
    is_active,
    enrollment_source_course_id
  )
  VALUES (
    NEW.name,
    NEW.description,
    NEW.organization_id,
    NEW.created_by,
    NEW.is_active,
    NEW.id
  )
  RETURNING id INTO v_path_id;

  INSERT INTO public.training_path_items (
    training_path_id,
    course_id,
    sort_order
  )
  VALUES (v_path_id, NEW.id, 0);

  PERFORM public.recalculate_training_path_total_hours(v_path_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courses_singleton_enrollment_path ON public.courses;
CREATE TRIGGER trg_courses_singleton_enrollment_path
  AFTER INSERT ON public.courses
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_courses_create_singleton_enrollment_path();

COMMENT ON FUNCTION public.trg_courses_create_singleton_enrollment_path() IS
  'Ensures each course has a canonical training_paths row for enrollment (Option B).';

COMMIT;
