-- Signature lines use the aviation date DD-MMM-YYYY.

BEGIN;

CREATE OR REPLACE FUNCTION public.format_logbook_signature_line(
  p_full_name text,
  p_cert_type text,
  p_cert_number text,
  p_signed_on date
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_ct text;
  v_cn text;
  v_date date;
  v_label text;
  v_months text[] := ARRAY[
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
BEGIN
  v_name := COALESCE(NULLIF(btrim(p_full_name), ''), 'Unknown');
  v_ct := COALESCE(NULLIF(btrim(p_cert_type), ''), 'A&P');
  v_cn := NULLIF(btrim(p_cert_number), '');
  v_date := COALESCE(p_signed_on, CURRENT_DATE);
  v_label := to_char(v_date, 'DD') || '-' || v_months[EXTRACT(MONTH FROM v_date)::int] || '-' || to_char(v_date, 'YYYY');
  IF v_cn IS NULL THEN
    RETURN format('%s (%s) %s', v_name, v_ct, v_label);
  END IF;
  RETURN format('%s (%s %s) %s', v_name, v_ct, v_cn, v_label);
END;
$$;

-- Rewrite stored signature lines that end with a long English month date.
DO $$
DECLARE
  r record;
  m text[];
  long_months text[] := ARRAY[
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  short_months text[] := ARRAY[
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];
  idx int;
BEGIN
  FOR r IN
    SELECT id, signature_text
    FROM public.logbook_entries
    WHERE signature_text ~ '(January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{1,2}, [0-9]{4}$'
  LOOP
    m := regexp_match(
      r.signature_text,
      '(January|February|March|April|May|June|July|August|September|October|November|December) ([0-9]{1,2}), ([0-9]{4})$'
    );
    idx := array_position(long_months, m[1]);
    IF idx IS NULL THEN
      CONTINUE;
    END IF;
    UPDATE public.logbook_entries
    SET signature_text = regexp_replace(
      signature_text,
      '(January|February|March|April|May|June|July|August|September|October|November|December) [0-9]{1,2}, [0-9]{4}$',
      lpad(m[2], 2, '0') || '-' || short_months[idx] || '-' || m[3]
    )
    WHERE id = r.id;
  END LOOP;
END $$;

COMMIT;
