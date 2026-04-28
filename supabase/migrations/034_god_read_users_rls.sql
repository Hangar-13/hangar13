-- Let system role `god` read any row in public.users (god dashboard lookups, org member lists)
-- using the normal authenticated Supabase client — no service role key required for reads.
-- Invite flows still use auth.admin with SUPABASE_SERVICE_ROLE_KEY.

BEGIN;

CREATE POLICY "System god can read all user rows"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.users me
      WHERE me.id = auth.uid()
        AND me.role = 'god'::text
    )
  );

COMMIT;
