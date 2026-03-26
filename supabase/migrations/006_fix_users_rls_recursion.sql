-- Policies on public.users that use EXISTS (SELECT … FROM public.users …) recurse:
-- the inner SELECT applies users RLS again and triggers infinite recursion on UPDATE.
-- These helpers run as SECURITY DEFINER and bypass RLS for the role lookup.

CREATE OR REPLACE FUNCTION public.auth_is_god()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid() AND role = 'god'::text
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_is_manager_or_god()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid() AND role = ANY (ARRAY['manager'::text, 'god'::text])
  );
$$;

REVOKE ALL ON FUNCTION public.auth_is_god() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_is_manager_or_god() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_god() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_manager_or_god() TO authenticated;

DROP POLICY IF EXISTS "Gods can update manager roles" ON public.users;
CREATE POLICY "Gods can update manager roles" ON public.users FOR UPDATE USING ((
  public.auth_is_god()
  AND (role = 'manager'::text)
));

DROP POLICY IF EXISTS "Managers can update apprentice and mentor roles" ON public.users;
CREATE POLICY "Managers can update apprentice and mentor roles" ON public.users FOR UPDATE USING ((
  public.auth_is_manager_or_god()
  AND (role = ANY (ARRAY['apprentice'::text, 'mentor'::text]))
));
