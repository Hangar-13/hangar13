-- Mechanic certificate numbers are exactly 7 digits (no leading letter).

BEGIN;

-- One-time: letter + 7 digits (legacy) -> 7 digits only
UPDATE public.users
SET mechanic_certificate_number = substring(btrim(mechanic_certificate_number) from 2 for 7)
WHERE mechanic_certificate_number IS NOT NULL
  AND btrim(mechanic_certificate_number) ~ '^[A-Za-z][0-9]{7}$';

COMMENT ON COLUMN public.users.mechanic_certificate_number IS
  'Certificate number for logbook signatures: exactly 7 digits.';

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

  IF v_cn !~ '^[0-9]{7}$' THEN
    RAISE EXCEPTION 'invalid_cert_number' USING ERRCODE = '22023';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.mechanic_certificate_number IS NOT NULL
      AND btrim(u.mechanic_certificate_number) <> ''
      AND btrim(u.mechanic_certificate_number) = v_cn
  );
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

  IF v_ct NOT IN ('A', 'P', 'A&P', 'AME') THEN
    RAISE EXCEPTION 'invalid_cert_type' USING ERRCODE = '22023';
  END IF;

  IF v_cn !~ '^[0-9]{7}$' THEN
    RAISE EXCEPTION 'invalid_cert_number' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.mechanic_certificate_number IS NOT NULL
      AND btrim(u.mechanic_certificate_number) <> ''
      AND btrim(u.mechanic_certificate_number) = v_cn
  ) THEN
    RAISE EXCEPTION 'That certificate number is already in use.' USING ERRCODE = '22023';
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
