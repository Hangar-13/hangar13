-- Align lessons RLS with modules (017): use public.users, not the profiles compat view.
-- Nested RLS + security_invoker on public.profiles can make EXISTS(public.profiles) fail
-- for updates even when the same user passes assertManagerOrGodRole (public.users).

BEGIN;

DROP POLICY IF EXISTS "Mentors and above can manage training plan weeks" ON public.lessons;

CREATE POLICY "Mentors and above can manage training plan weeks"
  ON public.lessons
  FOR ALL
  USING ((
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
    )
  ));

COMMIT;
