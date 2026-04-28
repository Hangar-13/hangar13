-- Remove deprecated public.profiles alias (see 009). PostgREST and app code should use public.users.

REVOKE ALL PRIVILEGES ON public.profiles FROM authenticated;
REVOKE ALL PRIVILEGES ON public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON public.profiles FROM service_role;

DROP VIEW IF EXISTS public.profiles;
