-- Trainee modal loads mentor display via public.users SELECTs; RLS on users can recurse (42P17).
-- Harden logbook mentor helpers the same way as get_session_user_profile / set_current_curriculum_id.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_logbook_mentor_display_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_mid uuid;
  m RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated.');
  END IF;

  SELECT u.mentor_id INTO v_mid
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_mid IS NULL THEN
    RETURN jsonb_build_object(
      'hasAssignedMentor', false,
      'mentor', null
    );
  END IF;

  SELECT
    x.id,
    x.full_name,
    x.mechanic_certificate_type,
    x.mechanic_certificate_number,
    x.visible
  INTO m
  FROM public.users x
  WHERE x.id = v_mid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'hasAssignedMentor', false,
      'mentor', null
    );
  END IF;

  RETURN jsonb_build_object(
    'hasAssignedMentor', true,
    'mentor', jsonb_build_object(
      'id', m.id,
      'full_name', m.full_name,
      'mechanic_certificate_type', m.mechanic_certificate_type,
      'mechanic_certificate_number', m.mechanic_certificate_number,
      'visible', m.visible
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_logbook_mentor_display_context() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_logbook_mentor_display_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_logbook_mentor_display_context() TO service_role;

COMMENT ON FUNCTION public.get_logbook_mentor_display_context() IS
  'Trainee: mentor_id + mentor mechanic display fields without re-entering users RLS.';

CREATE OR REPLACE FUNCTION public.search_mechanic_mentors(p_query text, p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  full_name text,
  mechanic_certificate_type text,
  mechanic_certificate_number text,
  visible boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_lim int := greatest(1, least(40, coalesce(p_limit, 20)));
  v_q text := btrim(coalesce(p_query, ''));
  v_pat text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_q = '' THEN
    RETURN;
  END IF;

  v_pat := '%' || v_q || '%';

  RETURN QUERY
  SELECT
    u.id,
    u.full_name,
    u.mechanic_certificate_type,
    u.mechanic_certificate_number,
    u.visible
  FROM public.users u
  WHERE (
      u.full_name ILIKE v_pat
      OR u.mechanic_certificate_number ILIKE v_pat
      OR u.email ILIKE v_pat
    )
    AND (
      u.mechanic_certificate_number IS NOT NULL AND btrim(u.mechanic_certificate_number) <> ''
      OR u.visible = false
    )
  ORDER BY u.full_name ASC NULLS LAST
  LIMIT v_lim;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_self_mentor(p_mentor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'Not authenticated');
  END IF;

  IF p_mentor_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Mentor id required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = p_mentor_id) THEN
    RETURN jsonb_build_object('error', 'Mentor not found');
  END IF;

  IF p_mentor_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'Invalid mentor');
  END IF;

  UPDATE public.users
  SET mentor_id = p_mentor_id
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_external_mentor_for_self(
  p_first_name text,
  p_last_name text,
  p_mechanic_cert_type text,
  p_mechanic_cert_number text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_id uuid;
  v_fn text := btrim(coalesce(p_first_name, ''));
  v_ln text := btrim(coalesce(p_last_name, ''));
  v_full text;
  v_ct text := btrim(upper(coalesce(p_mechanic_cert_type, '')));
  v_cn text := btrim(coalesce(p_mechanic_cert_number, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_fn = '' OR v_ln = '' THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  v_full := v_fn || ' ' || v_ln;

  IF v_ct NOT IN ('A', 'P', 'A&P') THEN
    RAISE EXCEPTION 'invalid_cert_type' USING ERRCODE = '22023';
  END IF;

  IF v_cn = '' THEN
    RAISE EXCEPTION 'invalid_cert_number' USING ERRCODE = '22023';
  END IF;

  v_id := gen_random_uuid();
  INSERT INTO public.users (
    id,
    email,
    full_name,
    role,
    visible,
    platform_elevation,
    mechanic_certificate_type,
    mechanic_certificate_number
  )
  VALUES (
    v_id,
    NULL,
    v_full,
    'guest',
    false,
    NULL,
    v_ct,
    v_cn
  );

  UPDATE public.users
  SET mentor_id = v_id
  WHERE id = auth.uid();

  RETURN v_id;
END;
$$;

COMMIT;
