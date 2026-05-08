-- Per-token mentor search (so "John Smith A1234567" matches cert column) + RPC to check cert# availability in the UI.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_mechanic_certificate_number_taken(p_cert_number text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_cn text := btrim(coalesce(p_cert_number, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_cn = '' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.mechanic_certificate_number IS NOT NULL
      AND btrim(u.mechanic_certificate_number) <> ''
      AND upper(btrim(u.mechanic_certificate_number)) = upper(v_cn)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_mechanic_certificate_number_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_mechanic_certificate_number_taken(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_mechanic_certificate_number_taken(text) TO service_role;

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
      OR EXISTS (
        SELECT 1
        FROM unnest(string_to_array(v_q, ' ')) AS tok(token)
        WHERE btrim(tok.token) <> ''
          AND (
            u.full_name ILIKE ('%' || btrim(tok.token) || '%')
            OR u.mechanic_certificate_number ILIKE ('%' || btrim(tok.token) || '%')
            OR upper(btrim(u.mechanic_certificate_number)) = upper(btrim(tok.token))
          )
      )
    )
    AND (
      u.mechanic_certificate_number IS NOT NULL AND btrim(u.mechanic_certificate_number) <> ''
      OR u.visible = false
    )
  ORDER BY u.full_name ASC NULLS LAST
  LIMIT v_lim;
END;
$$;

COMMIT;
