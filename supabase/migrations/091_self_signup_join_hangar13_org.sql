-- Self sign-ups (public signup form) are automatically added to the "Hangar 13"
-- organization as a student. Admin-invited users (auth.users.invited_at set) are
-- left alone — their org membership is assigned explicitly by the inviting flow.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
  AS $$
DECLARE
  user_role text;
  is_invite boolean;
  v_org_id uuid;
BEGIN
  -- Admin-created accounts go through inviteUserByEmail, which stamps invited_at.
  -- Anyone hitting the public signup form has invited_at = NULL.
  is_invite := NEW.invited_at IS NOT NULL;

  user_role := coalesce(NEW.raw_user_meta_data->>'role', 'standard');

  -- Self sign-ups are always 'standard' regardless of what the client posted.
  IF NOT is_invite THEN
    user_role := 'standard';
  END IF;

  -- Defense in depth: reject anything outside the known platform roles.
  IF user_role IS NULL OR user_role NOT IN ('guest', 'standard', 'admin', 'god') THEN
    user_role := 'standard';
  END IF;

  INSERT INTO public.users (id, email, full_name, role, platform_elevation)
  VALUES (
    NEW.id,
    NEW.email,
    coalesce(NEW.raw_user_meta_data->>'full_name', ''),
    user_role,
    CASE
      WHEN user_role = ANY (ARRAY['admin'::text, 'god'::text]) THEN user_role
      ELSE NULL
    END
  );

  -- Auto-enroll self sign-ups into the Hangar 13 organization as a student.
  -- Skipped for invited users (the inviting flow sets their membership) and
  -- best-effort: a missing org must never block account creation.
  IF NOT is_invite THEN
    SELECT id INTO v_org_id
    FROM public.organizations
    WHERE lower(btrim(name)) = 'hangar 13'
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_org_id IS NOT NULL THEN
      INSERT INTO public.user_organizations (user_id, organization_id, role)
      VALUES (NEW.id, v_org_id, 'student')
      ON CONFLICT (user_id, organization_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
