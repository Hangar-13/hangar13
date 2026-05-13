-- Rename users.current_curriculum_id → current_user_training_id (FK to user_trainings).
-- Drops legacy "curriculum" wording; aligns with enrollment model.

BEGIN;

DROP TRIGGER IF EXISTS trg_users_validate_current_curriculum ON public.users;

DROP FUNCTION IF EXISTS public.users_validate_current_curriculum();

DROP FUNCTION IF EXISTS public.set_current_curriculum_id(uuid);

ALTER TABLE public.users
  RENAME COLUMN current_curriculum_id TO current_user_training_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_current_curriculum_id_fkey'
  ) THEN
    ALTER TABLE public.users
      RENAME CONSTRAINT users_current_curriculum_id_fkey TO users_current_user_training_id_fkey;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'idx_users_current_curriculum_id'
  ) THEN
    ALTER INDEX public.idx_users_current_curriculum_id RENAME TO idx_users_current_user_training_id;
  END IF;
END $$;

COMMENT ON COLUMN public.users.current_user_training_id IS
  'Active user_trainings row for dashboard, logbook, progress (nullable).';

CREATE OR REPLACE FUNCTION public.users_validate_current_user_training()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_user_training_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_trainings ut
      WHERE ut.id = NEW.current_user_training_id AND ut.user_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'current_user_training_id must reference a user_trainings row for this user'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_validate_current_user_training
  BEFORE INSERT OR UPDATE OF current_user_training_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.users_validate_current_user_training();

CREATE OR REPLACE FUNCTION public.set_current_user_training_id(p_user_training_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.'
      USING ERRCODE = '28000';
  END IF;

  SELECT ut.status
  INTO v_status
  FROM public.user_trainings ut
  WHERE ut.id = p_user_training_id
    AND ut.user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment not found.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'completed'::text THEN
    RAISE EXCEPTION 'Completed training cannot be set as current.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.users u
  SET current_user_training_id = p_user_training_id
  WHERE u.id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.set_current_user_training_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_current_user_training_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_current_user_training_id(uuid) TO service_role;

COMMENT ON FUNCTION public.set_current_user_training_id(uuid) IS
  'Sets users.current_user_training_id for auth.uid() after validating enrollment; bypasses users RLS.';

DROP FUNCTION IF EXISTS public.get_session_user_profile();

CREATE FUNCTION public.get_session_user_profile()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role text,
  visible boolean,
  last_active_organization_id uuid,
  current_user_training_id uuid,
  current_certification text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.role,
    u.visible,
    u.last_active_organization_id,
    u.current_user_training_id,
    u.current_certification::text AS current_certification
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_session_user_profile() IS
  'Returns at most one row: the caller''s public.users record (auth.uid()), regardless of users RLS.';

REVOKE ALL ON FUNCTION public.get_session_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO service_role;

COMMIT;
