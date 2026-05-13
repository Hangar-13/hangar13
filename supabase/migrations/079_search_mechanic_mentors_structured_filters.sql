-- Mentor directory search: AND across first name, last name, and certificate prefix (each optional).
-- Empty / omitted dimensions do not filter. Replaces the prior single-string OR/token search.

BEGIN;

DROP FUNCTION IF EXISTS public.search_mechanic_mentors(text, int);

CREATE OR REPLACE FUNCTION public.search_mechanic_mentors(
  p_first_name text,
  p_last_name text,
  p_cert_prefix text,
  p_limit int DEFAULT 20
)
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
  v_fn text := lower(btrim(coalesce(p_first_name, '')));
  v_ln text := lower(btrim(coalesce(p_last_name, '')));
  v_cert text := regexp_replace(coalesce(p_cert_prefix, ''), '\D', '', 'g');
  v_norm text;
  v_first_word text;
  v_last_word text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_fn = '' AND v_ln = '' AND v_cert = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.full_name,
    u.mechanic_certificate_type,
    u.mechanic_certificate_number,
    u.visible
  FROM public.users u
  WHERE
    (
      v_fn = ''
      OR (
        btrim(coalesce(u.full_name, '')) <> ''
        AND lower(
          split_part(
            regexp_replace(btrim(coalesce(u.full_name, '')), '\s+', ' ', 'g'),
            ' ',
            1
          )
        ) LIKE v_fn || '%'
      )
    )
    AND (
      v_ln = ''
      OR (
        btrim(coalesce(u.full_name, '')) <> ''
        AND lower(
          reverse(
            split_part(
              reverse(regexp_replace(btrim(coalesce(u.full_name, '')), '\s+', ' ', 'g')),
              ' ',
              1
            )
          )
        ) LIKE v_ln || '%'
      )
    )
    AND (
      v_cert = ''
      OR regexp_replace(coalesce(u.mechanic_certificate_number, ''), '\D', '', 'g') LIKE v_cert || '%'
    )
    AND (
      u.mechanic_certificate_number IS NOT NULL AND btrim(u.mechanic_certificate_number) <> ''
      OR u.visible = false
    )
  ORDER BY u.full_name ASC NULLS LAST
  LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION public.search_mechanic_mentors(text, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_mechanic_mentors(text, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_mechanic_mentors(text, text, text, int) TO service_role;

COMMIT;
