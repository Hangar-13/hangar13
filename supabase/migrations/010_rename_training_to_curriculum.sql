-- Rename training_plans -> curriculums, training_plan_weeks -> lessons,
-- training_plan_id -> curriculum_id, users.current_user_training_id -> current_curriculum_id.
-- Idempotent: safe to re-run on DBs that already applied this migration.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'training_plans'
  ) THEN
    ALTER TABLE public.training_plans RENAME TO curriculums;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'training_plan_weeks'
  ) THEN
    ALTER TABLE public.training_plan_weeks RENAME TO lessons;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Columns: FK to curriculums
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lessons' AND column_name = 'training_plan_id'
  ) THEN
    ALTER TABLE public.lessons RENAME COLUMN training_plan_id TO curriculum_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'user_trainings' AND column_name = 'training_plan_id'
  ) THEN
    ALTER TABLE public.user_trainings RENAME COLUMN training_plan_id TO curriculum_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Constraint names (cosmetic; names may still reflect old table/column)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_weeks_training_plan_id_week_number_key') THEN
    ALTER TABLE public.lessons RENAME CONSTRAINT training_plan_weeks_training_plan_id_week_number_key TO lessons_curriculum_id_week_number_key;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_weeks_training_plan_id_fkey') THEN
    ALTER TABLE public.lessons RENAME CONSTRAINT training_plan_weeks_training_plan_id_fkey TO lessons_curriculum_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plan_weeks_pkey') THEN
    ALTER TABLE public.lessons RENAME CONSTRAINT training_plan_weeks_pkey TO lessons_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plans_pkey') THEN
    ALTER TABLE public.curriculums RENAME CONSTRAINT training_plans_pkey TO curriculums_pkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_plans_created_by_fkey') THEN
    ALTER TABLE public.curriculums RENAME CONSTRAINT training_plans_created_by_fkey TO curriculums_created_by_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'apprentices_training_plan_id_fkey') THEN
    ALTER TABLE public.user_trainings RENAME CONSTRAINT apprentices_training_plan_id_fkey TO user_trainings_curriculum_id_fkey;
  ELSIF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_trainings_training_plan_id_fkey') THEN
    ALTER TABLE public.user_trainings RENAME CONSTRAINT user_trainings_training_plan_id_fkey TO user_trainings_curriculum_id_fkey;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_training_plan_weeks_training_plan_id') THEN
    ALTER INDEX public.idx_training_plan_weeks_training_plan_id RENAME TO idx_lessons_curriculum_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_user_trainings_training_plan_id') THEN
    ALTER INDEX public.idx_user_trainings_training_plan_id RENAME TO idx_user_trainings_curriculum_id;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Triggers on curriculums / lessons (names only)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_training_plans_updated_at' AND tgrelid = 'public.curriculums'::regclass) THEN
    ALTER TRIGGER update_training_plans_updated_at ON public.curriculums RENAME TO update_curriculums_updated_at;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_training_plan_weeks_updated_at' AND tgrelid = 'public.lessons'::regclass) THEN
    ALTER TRIGGER update_training_plan_weeks_updated_at ON public.lessons RENAME TO update_lessons_updated_at;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. users.current_user_training_id -> current_curriculum_id + validation
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_users_validate_current_user_training ON public.users;
DROP TRIGGER IF EXISTS trg_users_validate_current_curriculum ON public.users;

DROP FUNCTION IF EXISTS public.users_validate_current_user_training();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'current_user_training_id'
  ) THEN
    ALTER TABLE public.users RENAME COLUMN current_user_training_id TO current_curriculum_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_current_user_training_id_fkey') THEN
    ALTER TABLE public.users RENAME CONSTRAINT users_current_user_training_id_fkey TO users_current_curriculum_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_users_current_user_training_id') THEN
    ALTER INDEX public.idx_users_current_user_training_id RENAME TO idx_users_current_curriculum_id;
  END IF;
END $$;

COMMENT ON COLUMN public.users.current_curriculum_id IS 'Active user_trainings row for dashboard, logbook, progress (nullable).';

CREATE OR REPLACE FUNCTION public.users_validate_current_curriculum() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.current_curriculum_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.user_trainings ut
            WHERE ut.id = NEW.current_curriculum_id AND ut.user_id = NEW.id
        ) THEN
            RAISE EXCEPTION 'current_curriculum_id must reference a user_trainings row for this user'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_validate_current_curriculum
    BEFORE INSERT OR UPDATE OF current_curriculum_id ON public.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.users_validate_current_curriculum();
