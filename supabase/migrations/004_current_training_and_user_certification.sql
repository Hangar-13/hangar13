-- Active training pointer on users; certification goal on users (decoupled from user_trainings).
-- Drops certification from user_trainings.

-- ---------------------------------------------------------------------------
-- 1. Users: current enrollment + optional certification goal
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS current_user_training_id uuid,
  ADD COLUMN IF NOT EXISTS current_certification public.certification;

COMMENT ON COLUMN public.users.current_user_training_id IS 'Active user_trainings row for dashboard, logbook, progress (nullable).';
COMMENT ON COLUMN public.users.current_certification IS 'FAA ACS certification goal for the user; NULL if none.';

ALTER TABLE public.users
  ADD CONSTRAINT users_current_user_training_id_fkey
  FOREIGN KEY (current_user_training_id) REFERENCES public.user_trainings(id) ON DELETE SET NULL;

-- PG disallows subqueries in CHECK; enforce ownership with a trigger instead.
CREATE OR REPLACE FUNCTION public.users_validate_current_user_training() RETURNS trigger
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

DROP TRIGGER IF EXISTS trg_users_validate_current_user_training ON public.users;
CREATE TRIGGER trg_users_validate_current_user_training
    BEFORE INSERT OR UPDATE OF current_user_training_id ON public.users
    FOR EACH ROW
    EXECUTE PROCEDURE public.users_validate_current_user_training();

CREATE INDEX IF NOT EXISTS idx_users_current_user_training_id ON public.users (current_user_training_id);

-- Backfill: pick earliest enrollment per user
UPDATE public.users u
SET current_user_training_id = sub.id
FROM (
  SELECT DISTINCT ON (user_id) id, user_id
  FROM public.user_trainings
  ORDER BY user_id, created_at ASC
) sub
WHERE u.id = sub.user_id
  AND u.current_user_training_id IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Remove certification from enrollments (concept lives on users)
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_trainings DROP COLUMN IF EXISTS certification;

-- ---------------------------------------------------------------------------
-- 3. Signup: create default enrollment and set current_user_training_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
    v_training_id UUID;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'apprentice');

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role
    );

    INSERT INTO public.user_trainings (user_id, start_date, status)
    SELECT NEW.id, CURRENT_DATE, 'active'
    WHERE NOT EXISTS (SELECT 1 FROM public.user_trainings ut WHERE ut.user_id = NEW.id)
    RETURNING id INTO v_training_id;

    IF v_training_id IS NULL THEN
        SELECT ut.id INTO v_training_id
        FROM public.user_trainings ut
        WHERE ut.user_id = NEW.id
        ORDER BY ut.created_at ASC
        LIMIT 1;
    END IF;

    IF v_training_id IS NOT NULL THEN
        UPDATE public.users
        SET current_user_training_id = v_training_id
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;
