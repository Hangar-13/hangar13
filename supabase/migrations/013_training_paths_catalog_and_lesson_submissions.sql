-- training_paths = catalog grouping only (ordered items in training_path_items).
-- user_trainings = enrollment + progress; material is either course_id OR training_path_id (not both).
-- lesson_submissions (renamed from weekly_submissions) = per-lesson work, linked to user_trainings.
-- Drops: training_path_assignments, curriculum_items, users.current_training_path_id.

-- ---------------------------------------------------------------------------
-- 1. user_trainings: optional training_path_id (exclusive with course_id)
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_trainings
  ADD COLUMN IF NOT EXISTS training_path_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_trainings_training_path_id_fkey'
  ) THEN
    ALTER TABLE public.user_trainings
      ADD CONSTRAINT user_trainings_training_path_id_fkey
      FOREIGN KEY (training_path_id) REFERENCES public.training_paths(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_trainings_training_path_id
  ON public.user_trainings USING btree (training_path_id);

ALTER TABLE public.user_trainings DROP CONSTRAINT IF EXISTS user_trainings_course_or_path_exclusive;

ALTER TABLE public.user_trainings
  ADD CONSTRAINT user_trainings_course_or_path_exclusive CHECK (
    NOT (course_id IS NOT NULL AND training_path_id IS NOT NULL)
  );

COMMENT ON COLUMN public.user_trainings.course_id IS 'When set, enrollment follows this course catalog. Mutually exclusive with training_path_id.';
COMMENT ON COLUMN public.user_trainings.training_path_id IS 'When set, enrollment follows this training path definition. Mutually exclusive with course_id.';

-- ---------------------------------------------------------------------------
-- 2. Remove training_path_assignments and users.current_training_path_id
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users update own training_path_assignments" ON public.training_path_assignments;
DROP POLICY IF EXISTS "Managers and gods update all training_path_assignments" ON public.training_path_assignments;
DROP POLICY IF EXISTS "Users insert own training_path_assignments" ON public.training_path_assignments;
DROP POLICY IF EXISTS "Managers and gods insert training_path_assignments" ON public.training_path_assignments;
DROP POLICY IF EXISTS "Users can view own training_path_assignments" ON public.training_path_assignments;
DROP POLICY IF EXISTS "Managers and gods can view all training_path_assignments" ON public.training_path_assignments;

DROP TABLE IF EXISTS public.training_path_assignments;

DROP TRIGGER IF EXISTS trg_users_validate_current_training_path ON public.users;
DROP FUNCTION IF EXISTS public.users_validate_current_training_path();

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_current_training_path_id_fkey;
DROP INDEX IF EXISTS idx_users_current_training_path_id;
ALTER TABLE public.users DROP COLUMN IF EXISTS current_training_path_id;

-- ---------------------------------------------------------------------------
-- 3. apprentice_progress: curriculum_item_id → lesson_id (before dropping curriculum_items)
-- ---------------------------------------------------------------------------
ALTER TABLE public.apprentice_progress ADD COLUMN IF NOT EXISTS new_lesson_id uuid;

-- Subquery must join apprentice_progress as ap2; the target alias ap cannot appear inside FROM JOINs.
UPDATE public.apprentice_progress ap
SET new_lesson_id = sub.lid
FROM (
  SELECT
    ap2.id AS apid,
    l.id AS lid
  FROM public.apprentice_progress ap2
  INNER JOIN public.user_trainings ut ON ut.id = ap2.user_training_id
  INNER JOIN public.modules m ON m.course_id = ut.course_id
  INNER JOIN public.curriculum_items ci ON ci.id = ap2.curriculum_item_id
  INNER JOIN public.lessons l ON l.module_id = m.id AND l.week_number = ci.order_index
  WHERE ut.course_id IS NOT NULL
) sub
WHERE ap.id = sub.apid;

DELETE FROM public.apprentice_progress WHERE new_lesson_id IS NULL;

ALTER TABLE public.apprentice_progress DROP CONSTRAINT IF EXISTS apprentice_progress_curriculum_item_id_fkey;
ALTER TABLE public.apprentice_progress DROP CONSTRAINT IF EXISTS apprentice_progress_user_training_id_curriculum_item_id_key;

ALTER TABLE public.apprentice_progress DROP COLUMN curriculum_item_id;
ALTER TABLE public.apprentice_progress RENAME COLUMN new_lesson_id TO lesson_id;

ALTER TABLE public.apprentice_progress ALTER COLUMN lesson_id SET NOT NULL;

ALTER TABLE public.apprentice_progress
  ADD CONSTRAINT apprentice_progress_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

ALTER TABLE public.apprentice_progress
  ADD CONSTRAINT apprentice_progress_user_training_lesson_key UNIQUE (user_training_id, lesson_id);

DROP INDEX IF EXISTS idx_apprentice_progress_curriculum_item_id;
CREATE INDEX IF NOT EXISTS idx_apprentice_progress_lesson_id ON public.apprentice_progress USING btree (lesson_id);

-- ---------------------------------------------------------------------------
-- 4. weekly_submissions → lesson_submissions + lesson_id
-- ---------------------------------------------------------------------------
ALTER TABLE public.weekly_submissions ADD COLUMN IF NOT EXISTS lesson_id uuid;

UPDATE public.weekly_submissions ws
SET lesson_id = sub.lid
FROM (
  SELECT
    ws2.id AS sid,
    l.id AS lid
  FROM public.weekly_submissions ws2
  INNER JOIN public.user_trainings ut ON ut.id = ws2.user_training_id
  INNER JOIN public.modules m ON m.course_id = ut.course_id
  INNER JOIN public.lessons l ON l.module_id = m.id AND l.week_number = ws2.week_number
  WHERE ut.course_id IS NOT NULL
    AND ws2.lesson_id IS NULL
) sub
WHERE ws.id = sub.sid;

DELETE FROM public.weekly_submission_files WHERE submission_id IN (
  SELECT id FROM public.weekly_submissions WHERE lesson_id IS NULL
);
DELETE FROM public.weekly_submissions WHERE lesson_id IS NULL;

ALTER TABLE public.weekly_submissions ALTER COLUMN lesson_id SET NOT NULL;

ALTER TABLE public.weekly_submissions
  ADD CONSTRAINT weekly_submissions_lesson_id_fkey
  FOREIGN KEY (lesson_id) REFERENCES public.lessons(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_weekly_submissions_lesson_id ON public.weekly_submissions USING btree (lesson_id);

ALTER TABLE public.weekly_submissions DROP CONSTRAINT IF EXISTS weekly_submissions_curriculum_item_id_fkey;
ALTER TABLE public.weekly_submissions DROP COLUMN IF EXISTS curriculum_item_id;

ALTER TABLE public.weekly_submissions DROP CONSTRAINT IF EXISTS weekly_submissions_user_training_id_week_number_key;
ALTER TABLE public.weekly_submissions
  ADD CONSTRAINT lesson_submissions_user_training_lesson_key UNIQUE (user_training_id, lesson_id);

ALTER TABLE public.weekly_submissions RENAME TO lesson_submissions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_weekly_submissions_user_training_id') THEN
    ALTER INDEX public.idx_weekly_submissions_user_training_id RENAME TO idx_lesson_submissions_user_training_id;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_weekly_submissions_status') THEN
    ALTER INDEX public.idx_weekly_submissions_status RENAME TO idx_lesson_submissions_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_weekly_submissions_week_number') THEN
    ALTER INDEX public.idx_weekly_submissions_week_number RENAME TO idx_lesson_submissions_week_number;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_weekly_submissions_lesson_id') THEN
    ALTER INDEX public.idx_weekly_submissions_lesson_id RENAME TO idx_lesson_submissions_lesson_id;
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_weekly_submissions_updated_at ON public.lesson_submissions;
CREATE TRIGGER update_lesson_submissions_updated_at
  BEFORE UPDATE ON public.lesson_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.lesson_submissions IS 'Reflections/files per lesson; week_number is auxiliary and may differ from lessons.week_number.';
COMMENT ON COLUMN public.lesson_submissions.week_number IS 'Program week index for this submission; not required to match lessons.week_number.';

-- ---------------------------------------------------------------------------
-- 5. weekly_submission_files → lesson_submission_files
-- ---------------------------------------------------------------------------
ALTER TABLE public.weekly_submission_files RENAME TO lesson_submission_files;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_weekly_submission_files_submission_id') THEN
    ALTER INDEX public.idx_weekly_submission_files_submission_id RENAME TO idx_lesson_submission_files_submission_id;
  END IF;
END $$;

ALTER TABLE public.lesson_submission_files DROP CONSTRAINT IF EXISTS weekly_submission_files_submission_id_fkey;
ALTER TABLE public.lesson_submission_files
  ADD CONSTRAINT lesson_submission_files_submission_id_fkey
  FOREIGN KEY (submission_id) REFERENCES public.lesson_submissions(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Drop curriculum_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view curriculum items" ON public.curriculum_items;
DROP POLICY IF EXISTS "Mentors and above can manage curriculum items" ON public.curriculum_items;

DROP TABLE IF EXISTS public.curriculum_items;

-- ---------------------------------------------------------------------------
-- 7. RLS: lesson_submissions + lesson_submission_files
-- ---------------------------------------------------------------------------
ALTER TABLE public.lesson_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_submission_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Apprentices can manage own submissions" ON public.lesson_submissions;
DROP POLICY IF EXISTS "Managers and gods can review all submissions" ON public.lesson_submissions;
DROP POLICY IF EXISTS "Managers and gods can view all submissions" ON public.lesson_submissions;
DROP POLICY IF EXISTS "Mentors can review apprentice submissions" ON public.lesson_submissions;
DROP POLICY IF EXISTS "Mentors can view apprentice submissions" ON public.lesson_submissions;

CREATE POLICY "Apprentices can manage own lesson submissions"
  ON public.lesson_submissions FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_trainings ut
      WHERE ut.id = lesson_submissions.user_training_id AND ut.user_id = auth.uid()
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_trainings ut
      WHERE ut.id = lesson_submissions.user_training_id AND ut.user_id = auth.uid()
    )
  ));

CREATE POLICY "Managers and gods can review all lesson submissions"
  ON public.lesson_submissions FOR UPDATE
  USING ((
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
    )
  ));

CREATE POLICY "Managers and gods can view all lesson submissions"
  ON public.lesson_submissions FOR SELECT
  USING ((
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
    )
  ));

CREATE POLICY "Mentors can review apprentice lesson submissions"
  ON public.lesson_submissions FOR UPDATE
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_trainings ut
      WHERE ut.id = lesson_submissions.user_training_id AND ut.mentor_id = auth.uid()
    )
  ));

CREATE POLICY "Mentors can view apprentice lesson submissions"
  ON public.lesson_submissions FOR SELECT
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_trainings ut
      WHERE ut.id = lesson_submissions.user_training_id AND ut.mentor_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "Apprentices can view own submission files" ON public.lesson_submission_files;
DROP POLICY IF EXISTS "Managers and gods can view all submission files" ON public.lesson_submission_files;
DROP POLICY IF EXISTS "Mentors can view apprentice submission files" ON public.lesson_submission_files;

CREATE POLICY "Users can manage files for own lesson submissions"
  ON public.lesson_submission_files FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.lesson_submissions ls
      JOIN public.user_trainings ut ON ut.id = ls.user_training_id
      WHERE ls.id = lesson_submission_files.submission_id AND ut.user_id = auth.uid()
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.lesson_submissions ls
      JOIN public.user_trainings ut ON ut.id = ls.user_training_id
      WHERE ls.id = lesson_submission_files.submission_id AND ut.user_id = auth.uid()
    )
  ));

CREATE POLICY "Managers and gods can view all lesson submission files"
  ON public.lesson_submission_files FOR SELECT
  USING ((
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
    )
  ));

CREATE POLICY "Mentors can view mentee lesson submission files"
  ON public.lesson_submission_files FOR SELECT
  USING ((
    EXISTS (
      SELECT 1 FROM public.lesson_submissions ls
      JOIN public.user_trainings ut ON ut.id = ls.user_training_id
      WHERE ls.id = lesson_submission_files.submission_id AND ut.mentor_id = auth.uid()
    )
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_submissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lesson_submission_files TO authenticated;
GRANT ALL ON public.lesson_submissions TO service_role;
GRANT ALL ON public.lesson_submission_files TO service_role;

-- apprentice_progress policies (unchanged logic; table already uses lesson_id)
DROP POLICY IF EXISTS "Apprentices can manage own progress" ON public.apprentice_progress;
DROP POLICY IF EXISTS "Managers and gods can manage all apprentice progress" ON public.apprentice_progress;
DROP POLICY IF EXISTS "Mentors can manage apprentice progress" ON public.apprentice_progress;

CREATE POLICY "Apprentices can manage own progress"
  ON public.apprentice_progress FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_trainings ut
      WHERE ut.id = apprentice_progress.user_training_id AND ut.user_id = auth.uid()
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_trainings ut
      WHERE ut.id = apprentice_progress.user_training_id AND ut.user_id = auth.uid()
    )
  ));

CREATE POLICY "Managers and gods can manage all apprentice progress"
  ON public.apprentice_progress FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
    )
  ));

CREATE POLICY "Mentors can manage apprentice progress"
  ON public.apprentice_progress FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_trainings ut
      WHERE ut.id = apprentice_progress.user_training_id AND ut.mentor_id = auth.uid()
    )
  ));
