-- Rename trainee role value apprentice → student; default new signups to student.
-- Rename acs_signoff.apprentice_user_id → student_user_id (app code aligned).

BEGIN;

-- 1. Drop old role CHECK so rows can be updated to student (order matters)
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

UPDATE public.users SET role = 'student' WHERE role = 'apprentice';

-- 2. New role CHECK
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role = ANY (ARRAY['student'::text, 'mentor'::text, 'manager'::text, 'god'::text])
  );

ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'student';

-- 3. Signup trigger: default role metadata
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    user_role TEXT;
BEGIN
    user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');

    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        user_role
    );

    RETURN NEW;
END;
$$;

-- 4. acs_signoff column + names (policies reference this column; PG rewrites policy expressions on RENAME)
ALTER TABLE public.acs_signoff RENAME COLUMN apprentice_user_id TO student_user_id;

ALTER INDEX IF EXISTS idx_acs_signoff_apprentice_user_id RENAME TO idx_acs_signoff_student_user_id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'acs_signoff_acs_code_id_apprentice_user_id_key'
  ) THEN
    ALTER TABLE public.acs_signoff RENAME CONSTRAINT acs_signoff_acs_code_id_apprentice_user_id_key
      TO acs_signoff_acs_code_id_student_user_id_key;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'acs_signoff_apprentice_user_id_fkey'
  ) THEN
    ALTER TABLE public.acs_signoff RENAME CONSTRAINT acs_signoff_apprentice_user_id_fkey
      TO acs_signoff_student_user_id_fkey;
  END IF;
END $$;

-- 5. RLS: policy bodies that still reference role = 'apprentice' (data migrated; must match new literal)

DROP POLICY IF EXISTS "Managers can update apprentice and mentor roles" ON public.users;
CREATE POLICY "Managers can update student and mentor roles" ON public.users FOR UPDATE USING ((
  public.auth_is_manager_or_god()
  AND (role = ANY (ARRAY['student'::text, 'mentor'::text]))
));

DROP POLICY IF EXISTS "Mentors can view apprentice profiles" ON public.users;
CREATE POLICY "Mentors can view student profiles" ON public.users FOR SELECT USING ((
  public.is_mentor() AND (role = 'student'::text)
));

-- INSERT policy references trainee user id column (renamed above; reapply with correct name for clarity in dumps)
DROP POLICY IF EXISTS "Mentors can insert acs_signoff for their apprentices" ON public.acs_signoff;
CREATE POLICY "Mentors can insert acs_signoff for their students" ON public.acs_signoff FOR INSERT WITH CHECK ((
  (auth.uid() = signer_id) AND (EXISTS (
    SELECT 1
    FROM public.user_trainings ut
    WHERE ut.user_id = acs_signoff.student_user_id AND ut.mentor_id = acs_signoff.signer_id
  ))
));

COMMIT;

COMMENT ON COLUMN public.acs_signoff.student_user_id IS 'Trainee (student) user id for this ACS sign-off.';
