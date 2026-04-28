-- Fix possible infinite RLS recursion from migration 034: EXISTS(SELECT…FROM users…)
-- inside a users SELECT policy. Use a single-row scalar subquery; "Users can view
-- own profile" can satisfy the subquery without re-evaluating the god policy.

BEGIN;

DROP POLICY IF EXISTS "System god can read all user rows" ON public.users;

CREATE POLICY "System god can read all user rows"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    (SELECT u.role::text
     FROM public.users u
     WHERE u.id = auth.uid()
     LIMIT 1) = 'god'::text
  );

COMMIT;
