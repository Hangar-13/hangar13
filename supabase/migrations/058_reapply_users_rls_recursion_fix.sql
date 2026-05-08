-- Re-apply users RLS recursion fix (42P17 on UPDATE current_curriculum_id, etc.).
-- Every FOR UPDATE policy on public.users is evaluated; "Platform admins may update users"
-- calls auth_is_platform_admin(). Without SET row_security = off inside that helper, the
-- inner SELECT from users re-enters users RLS and recurses even when "own profile" would allow.
--
-- Use this migration when a remote was marked up-to-date but still behaved like pre-057, or to
-- harden legacy helpers.

BEGIN;

CREATE OR REPLACE FUNCTION public.auth_is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = ANY (ARRAY['admin'::text, 'god'::text])
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_system_god()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'god'::text
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_god()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role = 'god'::text
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_trainee_mentor_matches(
  p_trainee_user_id uuid,
  p_mentor_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT COALESCE(
    (
      SELECT u.mentor_id IS NOT DISTINCT FROM p_mentor_user_id
      FROM public.users u
      WHERE u.id = p_trainee_user_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.auth_user_trainee_mentor_matches(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_trainee_mentor_matches(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_trainee_mentor_matches(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "Mentors can view reviewers for assigned mentees" ON public.users;
CREATE POLICY "Mentors can view reviewers for assigned mentees"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      WHERE le.approved_by = users.id
        AND public.auth_user_trainee_mentor_matches(le.user_id, auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_submissions ls
      INNER JOIN public.user_trainings ut ON ut.id = ls.user_training_id
      WHERE ut.mentor_id = auth.uid()
        AND ls.approved_by = users.id
    )
  );

COMMIT;
