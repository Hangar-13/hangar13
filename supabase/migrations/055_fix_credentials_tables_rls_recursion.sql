-- user_training_completions / user_certification_awards: "Managers and gods manage all …"
-- uses EXISTS (SELECT … FROM public.users). That subquery is subject to users RLS and re-enters
-- users policies → infinite recursion (42P17), breaking any SELECT on these tables for normal users.

BEGIN;

DROP POLICY IF EXISTS "Managers and gods manage all training completions"
  ON public.user_training_completions;
DROP POLICY IF EXISTS "Managers and gods manage all certification awards"
  ON public.user_certification_awards;

CREATE POLICY "Platform admins manage all training completions"
  ON public.user_training_completions
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

CREATE POLICY "Platform admins manage all certification awards"
  ON public.user_certification_awards
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

COMMIT;
