-- Expected hours per lesson, cached totals for course/path, completed training hours on enrollment.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.lessons
  ADD COLUMN IF NOT EXISTS hours numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.lessons
  DROP CONSTRAINT IF EXISTS lessons_hours_non_negative;
ALTER TABLE public.lessons
  ADD CONSTRAINT lessons_hours_non_negative CHECK (hours >= 0);

COMMENT ON COLUMN public.lessons.hours IS 'Planned hours for this lesson; used for training progress totals.';

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS total_hours numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.courses
  DROP CONSTRAINT IF EXISTS courses_total_hours_non_negative;
ALTER TABLE public.courses
  ADD CONSTRAINT courses_total_hours_non_negative CHECK (total_hours >= 0);

COMMENT ON COLUMN public.courses.total_hours IS 'Sum of hours for all lessons in this course; maintained by trigger.';

ALTER TABLE public.training_paths
  ADD COLUMN IF NOT EXISTS total_hours numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.training_paths
  DROP CONSTRAINT IF EXISTS training_paths_total_hours_non_negative;
ALTER TABLE public.training_paths
  ADD CONSTRAINT training_paths_total_hours_non_negative CHECK (total_hours >= 0);

COMMENT ON COLUMN public.training_paths.total_hours IS 'Sum of hours for all distinct lessons in this path; maintained by function.';

ALTER TABLE public.user_trainings
  ADD COLUMN IF NOT EXISTS hours_completed numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.user_trainings
  DROP CONSTRAINT IF EXISTS user_trainings_hours_completed_non_negative;
ALTER TABLE public.user_trainings
  ADD CONSTRAINT user_trainings_hours_completed_non_negative CHECK (hours_completed >= 0);

COMMENT ON COLUMN public.user_trainings.hours_completed IS 'Sum of lessons.hours for lessons with a submitted lesson_submission; maintained by trigger.';

-- ---------------------------------------------------------------------------
-- 2. Recalculate one course’s total from its lessons
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_course_total_hours(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  s numeric;
BEGIN
  SELECT COALESCE(SUM(l.hours), 0) INTO s
  FROM public.lessons l
  INNER JOIN public.modules m ON m.id = l.module_id
  WHERE m.course_id = p_course_id;

  UPDATE public.courses
  SET total_hours = s
  WHERE id = p_course_id;
END;
$f$;

-- ---------------------------------------------------------------------------
-- 3. Training path: same expansion rules as app fetchLessonsForTrainingPath (dedupe by lesson id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_training_path_total_hours(p_path_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  r RECORD;
  les RECORD;
  seen uuid[] := ARRAY[]::uuid[];
  v_sum numeric := 0;
  h numeric;
BEGIN
  FOR r IN
    SELECT id, course_id, module_id, lesson_id, sort_order
    FROM public.training_path_items
    WHERE training_path_id = p_path_id
    ORDER BY sort_order ASC, id ASC
  LOOP
    IF r.lesson_id IS NOT NULL THEN
      IF NOT (r.lesson_id = ANY (seen)) THEN
        seen := array_append(seen, r.lesson_id);
        SELECT COALESCE(l.hours, 0) INTO h FROM public.lessons l WHERE l.id = r.lesson_id;
        v_sum := v_sum + h;
      END IF;
    ELSIF r.module_id IS NOT NULL THEN
      FOR les IN
        SELECT id, hours FROM public.lessons
        WHERE module_id = r.module_id
        ORDER BY number ASC
      LOOP
        IF NOT (les.id = ANY (seen)) THEN
          seen := array_append(seen, les.id);
          v_sum := v_sum + COALESCE(les.hours, 0);
        END IF;
      END LOOP;
    ELSIF r.course_id IS NOT NULL THEN
      FOR les IN
        SELECT l.id, l.hours
        FROM public.lessons l
        INNER JOIN public.modules m ON m.id = l.module_id
        WHERE m.course_id = r.course_id
        ORDER BY m.number ASC, l.number ASC
      LOOP
        IF NOT (les.id = ANY (seen)) THEN
          seen := array_append(seen, les.id);
          v_sum := v_sum + COALESCE(les.hours, 0);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE public.training_paths
  SET total_hours = v_sum
  WHERE id = p_path_id;
END;
$f$;

-- Paths that reference a given lesson (directly, via module, or via course)
CREATE OR REPLACE FUNCTION public.recalculate_paths_for_lesson_id(p_lesson_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $f$
DECLARE
  r RECORD;
  v_module_id uuid;
  v_course_id uuid;
BEGIN
  SELECT l.module_id INTO v_module_id FROM public.lessons l WHERE l.id = p_lesson_id;
  IF v_module_id IS NULL THEN
    RETURN;
  END IF;
  SELECT m.course_id INTO v_course_id FROM public.modules m WHERE m.id = v_module_id;

  FOR r IN
    SELECT DISTINCT tpi.training_path_id AS pid
    FROM public.training_path_items tpi
    WHERE tpi.lesson_id = p_lesson_id
      OR tpi.module_id = v_module_id
      OR (tpi.course_id IS NOT NULL AND tpi.course_id = v_course_id)
  LOOP
    PERFORM public.recalculate_training_path_total_hours(r.pid);
  END LOOP;
END;
$f$;

-- ---------------------------------------------------------------------------
-- 4. Triggers: lessons -> course + paths
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_lessons_refresh_course_and_paths()
RETURNS trigger
LANGUAGE plpgsql
AS $f$
DECLARE
  v_c_new uuid;
  v_c_old uuid;
  v_lesson_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_lesson_id := OLD.id;
    SELECT m.course_id INTO v_c_old FROM public.modules m WHERE m.id = OLD.module_id;
    IF v_c_old IS NOT NULL THEN
      PERFORM public.recalculate_course_total_hours(v_c_old);
    END IF;
    PERFORM public.recalculate_paths_for_lesson_id(v_lesson_id);
    RETURN OLD;
  END IF;

  v_lesson_id := NEW.id;
  SELECT m.course_id INTO v_c_new FROM public.modules m WHERE m.id = NEW.module_id;
  IF v_c_new IS NOT NULL THEN
    PERFORM public.recalculate_course_total_hours(v_c_new);
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.module_id IS DISTINCT FROM NEW.module_id THEN
    SELECT m.course_id INTO v_c_old FROM public.modules m WHERE m.id = OLD.module_id;
    IF v_c_old IS NOT NULL AND v_c_old IS DISTINCT FROM v_c_new THEN
      PERFORM public.recalculate_course_total_hours(v_c_old);
    END IF;
  END IF;

  PERFORM public.recalculate_paths_for_lesson_id(v_lesson_id);
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS trg_lessons_refresh_hours_totals ON public.lessons;
CREATE TRIGGER trg_lessons_refresh_hours_totals
  AFTER INSERT OR UPDATE OR DELETE
  ON public.lessons
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lessons_refresh_course_and_paths();

-- Path items: reorder / scope changes
CREATE OR REPLACE FUNCTION public.trg_training_path_items_recalc()
RETURNS trigger
LANGUAGE plpgsql
AS $f$
DECLARE
  p uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    p := OLD.training_path_id;
  ELSE
    p := NEW.training_path_id;
  END IF;
  IF p IS NOT NULL THEN
    PERFORM public.recalculate_training_path_total_hours(p);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.training_path_id IS DISTINCT FROM NEW.training_path_id THEN
    PERFORM public.recalculate_training_path_total_hours(OLD.training_path_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$f$;

DROP TRIGGER IF EXISTS trg_training_path_items_recalc_hours ON public.training_path_items;
CREATE TRIGGER trg_training_path_items_recalc_hours
  AFTER INSERT OR UPDATE OR DELETE
  ON public.training_path_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_training_path_items_recalc();

-- ---------------------------------------------------------------------------
-- 5. user_trainings.hours_completed from submitted lesson_submissions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_user_training_hours_completed(p_user_training_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $f$
BEGIN
  UPDATE public.user_trainings ut
  SET hours_completed = COALESCE((
    SELECT SUM(l.hours)
    FROM public.lesson_submissions ls
    INNER JOIN public.lessons l ON l.id = ls.lesson_id
    WHERE ls.user_training_id = p_user_training_id
      AND ls.submitted_at IS NOT NULL
  ), 0)
  WHERE ut.id = p_user_training_id;
END;
$f$;

CREATE OR REPLACE FUNCTION public.trg_lesson_submissions_recalc_ut_hours()
RETURNS trigger
LANGUAGE plpgsql
AS $f$
DECLARE
  v_ut uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_ut := OLD.user_training_id;
  ELSE
    v_ut := NEW.user_training_id;
  END IF;
  IF v_ut IS NOT NULL THEN
    PERFORM public.recalculate_user_training_hours_completed(v_ut);
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_training_id IS DISTINCT FROM NEW.user_training_id THEN
    IF OLD.user_training_id IS NOT NULL THEN
      PERFORM public.recalculate_user_training_hours_completed(OLD.user_training_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$f$;

DROP TRIGGER IF EXISTS trg_lesson_submissions_recalc_ut_hours ON public.lesson_submissions;
CREATE TRIGGER trg_lesson_submissions_recalc_ut_hours
  AFTER INSERT OR UPDATE OF submitted_at, lesson_id, user_training_id OR DELETE
  ON public.lesson_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lesson_submissions_recalc_ut_hours();

-- ---------------------------------------------------------------------------
-- 6. Backfill
-- ---------------------------------------------------------------------------
DO $fb$
DECLARE
  c record;
  p record;
  ut record;
BEGIN
  FOR c IN SELECT id FROM public.courses
  LOOP
    PERFORM public.recalculate_course_total_hours(c.id);
  END LOOP;
  FOR p IN SELECT id FROM public.training_paths
  LOOP
    PERFORM public.recalculate_training_path_total_hours(p.id);
  END LOOP;
  FOR ut IN SELECT id FROM public.user_trainings
  LOOP
    PERFORM public.recalculate_user_training_hours_completed(ut.id);
  END LOOP;
END
$fb$;
