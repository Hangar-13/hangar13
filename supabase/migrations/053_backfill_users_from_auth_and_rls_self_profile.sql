-- 1) Heal accounts that can sign in (auth.users) but have no public.users row (failed trigger, repair gaps).
-- 2) Re-apply "Users can view own profile" so SELECT on own row is always allowed for authenticated role.

BEGIN;

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;

CREATE POLICY "Users can view own profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

COMMENT ON POLICY "Users can view own profile" ON public.users IS
  'Every signed-in user may read their own profile row (required for dashboards and getUserProfile).';

INSERT INTO public.users (
  id,
  email,
  full_name,
  role,
  platform_elevation,
  visible
)
SELECT
  au.id,
  au.email,
  COALESCE(NULLIF(btrim(au.raw_user_meta_data->>'full_name'), ''), ''),
  CASE
    WHEN COALESCE(au.raw_user_meta_data->>'role', 'standard') IN (
      'guest'::text, 'standard'::text, 'admin'::text, 'god'::text
    )
    THEN (au.raw_user_meta_data->>'role')::text
    ELSE 'standard'::text
  END,
  CASE
    WHEN (au.raw_user_meta_data->>'role') = ANY (ARRAY['admin'::text, 'god'::text])
    THEN (au.raw_user_meta_data->>'role')
    ELSE NULL
  END,
  true
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM public.users pu WHERE pu.id = au.id);

COMMIT;
