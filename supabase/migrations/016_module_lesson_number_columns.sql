-- Rename ordering columns: modules.sort_order -> number, lessons.week_number -> number.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'modules'
      AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE public.modules RENAME COLUMN sort_order TO number;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lessons'
      AND column_name = 'week_number'
  ) THEN
    ALTER TABLE public.lessons RENAME COLUMN week_number TO number;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_module_id_week_number_key'
  ) THEN
    ALTER TABLE public.lessons
      RENAME CONSTRAINT lessons_module_id_week_number_key TO lessons_module_id_number_key;
  END IF;
END $$;

COMMENT ON TABLE public.lesson_submissions IS 'Reflections/files per lesson; week_number is auxiliary and may differ from lessons.number.';
COMMENT ON COLUMN public.lesson_submissions.week_number IS 'Program week index for this submission; not required to match lessons.number.';
