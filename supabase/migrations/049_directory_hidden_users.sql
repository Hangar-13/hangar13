-- Non-login or archival personas: rows stay in public.users for FKs (signatures, mentor_id).
-- `visible = false` excludes them from directory-style UIs (admin lists, org rosters).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Defer public.users.id ↔ auth.users coupling (keep rows when auth account is removed).
-- ---------------------------------------------------------------------------
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS profiles_id_fkey;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_id_fkey;

ALTER TABLE public.users ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS visible boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.users.visible IS
  'When false, omit from directory-style UIs (admin user list, org member lists). '
  'Use for non-login personas (external mentors) or archival rows after auth removal. '
  'FK references (logbook approved_by, mentor_id, etc.) remain valid.';

CREATE OR REPLACE FUNCTION public.handle_auth_user_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.users
  SET visible = false
  WHERE id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;
CREATE TRIGGER on_auth_user_deleted
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_auth_user_deleted();

REVOKE ALL ON FUNCTION public.handle_auth_user_deleted() FROM PUBLIC;
COMMENT ON FUNCTION public.handle_auth_user_deleted() IS
  'Sets public.users.visible = false when the linked auth row is removed; keeps the profile row for history/FKs.';

-- ---------------------------------------------------------------------------
-- 2) Admin user list: directory participants only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.god_list_users_paginated(
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 20,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit int;
  v_offset int;
  v_total bigint;
  v_has_search boolean;
  v_pat text;
  v_rows jsonb;
BEGIN
  IF NOT public.auth_is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden'
      USING ERRCODE = '42501';
  END IF;

  v_limit := greatest(1, least(100, coalesce(p_limit, 20)));
  v_offset := greatest(0, coalesce(p_offset, 0));

  v_has_search := p_search is not null and btrim(p_search) <> '';
  v_pat := '%' || btrim(p_search) || '%';

  WITH matching AS (
    SELECT u.id
    FROM public.users u
    WHERE u.visible = true
      AND (
        NOT v_has_search
        OR (u.email ILIKE v_pat)
        OR (COALESCE(u.full_name, '') ILIKE v_pat)
        OR EXISTS (
          SELECT 1
          FROM public.user_organizations uo2
          JOIN public.organizations o2 ON o2.id = uo2.organization_id
          WHERE uo2.user_id = u.id
            AND o2.name ILIKE v_pat
        )
      )
  )
  SELECT count(*)::bigint INTO v_total FROM matching;

  SELECT coalesce((
    WITH matching AS (
      SELECT uu.id
      FROM public.users uu
      WHERE uu.visible = true
        AND (
          NOT v_has_search
          OR (uu.email ILIKE v_pat)
          OR (COALESCE(uu.full_name, '') ILIKE v_pat)
          OR EXISTS (
            SELECT 1
            FROM public.user_organizations uo2
            JOIN public.organizations o2 ON o2.id = uo2.organization_id
            WHERE uo2.user_id = uu.id
              AND o2.name ILIKE v_pat
          )
        )
    ),
    paged AS (
      SELECT m.id
      FROM matching m
      JOIN public.users u0 ON u0.id = m.id
      ORDER BY u0.email ASC NULLS LAST
      LIMIT v_limit OFFSET v_offset
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'full_name', u.full_name,
        'role', u.role,
        'created_at', u.created_at,
        'organizations', (
          SELECT coalesce(
            jsonb_agg(
              jsonb_build_object(
                'name', sub.name,
                'is_lead', sub.is_lead
              )
              ORDER BY sub.name
            ),
            '[]'::jsonb
          )
          FROM (
            SELECT
              o.name,
              (o.lead_user_id IS NOT NULL AND o.lead_user_id = u.id) AS is_lead
            FROM public.user_organizations uo
            JOIN public.organizations o ON o.id = uo.organization_id
            WHERE uo.user_id = u.id
          ) sub
        )
      )
      ORDER BY u.email ASC NULLS LAST
    )
    FROM paged p
    JOIN public.users u ON u.id = p.id
  ), '[]'::jsonb) INTO v_rows;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total);
END;
$$;

COMMENT ON FUNCTION public.god_list_users_paginated(text, int, int) IS
  'List directory users (admin / god). visible = true only. organizations: [{name, is_lead}].';

-- ---------------------------------------------------------------------------
-- 3) Service-only email lookup (invite flow): directory-visible accounts only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.god_find_user_by_email(p_email text)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.full_name, u.email
  FROM public.users u
  WHERE u.visible = true
    AND lower(trim(both from u.email::text)) = lower(trim(both from p_email::text))
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.god_find_user_by_email(text) IS
  'Service-role only: resolve public.users by email (god create-org lookup). visible = true only.';

-- ---------------------------------------------------------------------------
-- 4) RPCs: non-visible persona rows (admin or self as external mentor)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_directory_hidden_user(
  p_full_name text,
  p_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  IF NOT public.auth_is_platform_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  v_email := NULLIF(btrim(p_email), '');

  v_id := gen_random_uuid();
  INSERT INTO public.users (id, email, full_name, role, visible, platform_elevation)
  VALUES (
    v_id,
    v_email,
    btrim(p_full_name),
    'guest',
    false,
    NULL
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_directory_hidden_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_directory_hidden_user(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_directory_hidden_user(text, text) TO service_role;

COMMENT ON FUNCTION public.create_directory_hidden_user(text, text) IS
  'Platform admin: insert a non-login public.users row (visible = false) for FKs / display names.';

CREATE OR REPLACE FUNCTION public.claim_external_mentor_for_self(
  p_full_name text,
  p_email text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_full_name IS NULL OR btrim(p_full_name) = '' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  v_email := NULLIF(btrim(p_email), '');

  v_id := gen_random_uuid();
  INSERT INTO public.users (id, email, full_name, role, visible, platform_elevation)
  VALUES (
    v_id,
    v_email,
    btrim(p_full_name),
    'guest',
    false,
    NULL
  );

  UPDATE public.users
  SET mentor_id = v_id
  WHERE id = auth.uid();

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_external_mentor_for_self(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_external_mentor_for_self(text, text) TO authenticated;

COMMENT ON FUNCTION public.claim_external_mentor_for_self(text, text) IS
  'Creates a visible=false mentor user row and assigns it as the caller''s users.mentor_id.';

-- ---------------------------------------------------------------------------
-- 5) RLS: read paths for non-visible personas used as mentors / signers
-- ---------------------------------------------------------------------------
-- Must not subquery public.users from inside a users SELECT policy (RLS recursion).
CREATE OR REPLACE FUNCTION public.auth_current_user_mentor_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT u.mentor_id
  FROM public.users u
  WHERE u.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_current_user_mentor_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_current_user_mentor_id() TO authenticated;

COMMENT ON FUNCTION public.auth_current_user_mentor_id() IS
  'RLS helper: caller''s users.mentor_id without re-entering users policies.';

DROP POLICY IF EXISTS "Apprentices can view mentor profile" ON public.users;

CREATE POLICY "Trainees can view their mentor profile"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT ut.mentor_id
      FROM public.user_trainings ut
      WHERE ut.user_id = auth.uid()
        AND ut.mentor_id IS NOT NULL
    )
    OR id = public.auth_current_user_mentor_id()
  );

CREATE POLICY "Users can view reviewers linked to own training rows"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      INNER JOIN public.user_trainings ut ON ut.id = le.user_training_id
      WHERE ut.user_id = auth.uid()
        AND le.approved_by = users.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_submissions ls
      INNER JOIN public.user_trainings ut ON ut.id = ls.user_training_id
      WHERE ut.user_id = auth.uid()
        AND ls.approved_by = users.id
    )
  );

CREATE POLICY "Mentors can view reviewers for assigned mentees"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.logbook_entries le
      INNER JOIN public.user_trainings ut ON ut.id = le.user_training_id
      WHERE ut.mentor_id = auth.uid()
        AND le.approved_by = users.id
    )
    OR EXISTS (
      SELECT 1
      FROM public.lesson_submissions ls
      INNER JOIN public.user_trainings ut ON ut.id = ls.user_training_id
      WHERE ut.mentor_id = auth.uid()
        AND ls.approved_by = users.id
    )
  );

COMMIT;
