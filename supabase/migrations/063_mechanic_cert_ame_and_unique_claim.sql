-- AME certificate type + reject duplicate mechanic certificate numbers when creating external mentors.

BEGIN;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_mechanic_certificate_type_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_mechanic_certificate_type_check CHECK (
    mechanic_certificate_type IS NULL
    OR mechanic_certificate_type = ANY (
      ARRAY['A'::text, 'P'::text, 'A&P'::text, 'AME'::text]
    )
  );

COMMENT ON COLUMN public.users.mechanic_certificate_type IS
  'FAA mechanic rating for signatures: A, P, A&P, or AME.';

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

  IF v_cn = '' THEN
    RAISE EXCEPTION 'invalid_cert_number' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.mechanic_certificate_number IS NOT NULL
      AND btrim(u.mechanic_certificate_number) <> ''
      AND upper(btrim(u.mechanic_certificate_number)) = upper(v_cn)
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
    upper(v_cn)
  );

  UPDATE public.users
  SET mentor_id = v_id
  WHERE id = auth.uid();

  RETURN v_id;
END;
$$;

COMMIT;
