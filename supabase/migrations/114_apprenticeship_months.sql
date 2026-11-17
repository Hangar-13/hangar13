-- Apprentice programs track calendar months of OJT, not a fixed hour target.

BEGIN;

ALTER TABLE public.training_paths
  ADD COLUMN IF NOT EXISTS is_apprentice_program boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ojt_months_required integer;

ALTER TABLE public.training_paths
  DROP CONSTRAINT IF EXISTS training_paths_apprentice_months_check;

ALTER TABLE public.training_paths
  ADD CONSTRAINT training_paths_apprentice_months_check CHECK (
    (
      is_apprentice_program = false
      AND ojt_months_required IS NULL
    )
    OR (
      is_apprentice_program = true
      AND ojt_months_required IS NOT NULL
      AND ojt_months_required > 0
    )
  );

COMMENT ON COLUMN public.training_paths.is_apprentice_program IS
  'When true, enrolled apprentices track months of OJT against ojt_months_required.';
COMMENT ON COLUMN public.training_paths.ojt_months_required IS
  'Calendar months of apprenticeship required. Set only when is_apprentice_program is true.';

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_apprentice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apprenticeship_started_on date;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_apprentice_start_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_apprentice_start_check CHECK (
    is_apprentice = false
    OR apprenticeship_started_on IS NOT NULL
  );

COMMENT ON COLUMN public.users.is_apprentice IS
  'True when the user is working an apprenticeship rather than holding an A&P.';
COMMENT ON COLUMN public.users.apprenticeship_started_on IS
  'Month the apprenticeship started. The day is ignored; progress counts calendar months.';

CREATE TABLE IF NOT EXISTS public.user_apprenticeship_breaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  started_on date NOT NULL,
  ended_on date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_apprenticeship_breaks_range CHECK (
    ended_on IS NULL OR ended_on >= started_on
  )
);

COMMENT ON TABLE public.user_apprenticeship_breaks IS
  'Months an apprentice was away from the industry. Those months do not count toward the program.';

CREATE INDEX IF NOT EXISTS user_apprenticeship_breaks_user_id_idx
  ON public.user_apprenticeship_breaks (user_id);

ALTER TABLE public.user_apprenticeship_breaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own apprenticeship breaks" ON public.user_apprenticeship_breaks;
CREATE POLICY "Users manage own apprenticeship breaks"
  ON public.user_apprenticeship_breaks
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Mentors read trainee apprenticeship breaks" ON public.user_apprenticeship_breaks;
CREATE POLICY "Mentors read trainee apprenticeship breaks"
  ON public.user_apprenticeship_breaks
  FOR SELECT
  TO authenticated
  USING (public.auth_user_trainee_mentor_matches(user_id, auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_apprenticeship_breaks TO authenticated;
GRANT ALL ON public.user_apprenticeship_breaks TO service_role;

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
  current_certification text,
  default_start_path text,
  prior_ojt_skipped_at timestamp with time zone,
  is_apprentice boolean,
  apprenticeship_started_on date,
  mechanic_certificate_number text
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
    u.current_certification::text AS current_certification,
    u.default_start_path,
    u.prior_ojt_skipped_at,
    u.is_apprentice,
    u.apprenticeship_started_on,
    u.mechanic_certificate_number
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_session_user_profile() IS
  'Returns at most one row: the caller''s public.users record (auth.uid()), regardless of users RLS.';

REVOKE ALL ON FUNCTION public.get_session_user_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_user_profile() TO service_role;

COMMIT;
