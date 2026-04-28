-- Legacy REST clients (or cached bundles) may still request public.profiles.
-- Migration 003 renamed that table to public.users; PostgREST then returns:
-- "Could not find the table 'public.profiles' in the schema cache".
-- This view aliases the old resource name to the current table. Prefer using `users`.

DROP VIEW IF EXISTS public.profiles;

CREATE VIEW public.profiles AS
SELECT * FROM public.users;

-- Run queries as the invoker so RLS on public.users applies (PostgreSQL 15+).
ALTER VIEW public.profiles SET (security_invoker = true);

COMMENT ON VIEW public.profiles IS 'Deprecated alias for public.users; use users in new code.';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
GRANT SELECT ON public.profiles TO anon;
