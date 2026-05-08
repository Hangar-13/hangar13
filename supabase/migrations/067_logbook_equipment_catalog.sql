-- Shared pick lists for logbook optional fields: aircraft, engine, propeller.
-- Users search existing labels; new values are added on save via SECURITY DEFINER RPC.

BEGIN;

CREATE TABLE public.logbook_equipment_catalog (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  kind text NOT NULL,
  label text NOT NULL,
  normalized_label text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT logbook_equipment_catalog_pkey PRIMARY KEY (id),
  CONSTRAINT logbook_equipment_catalog_kind_check CHECK (kind = ANY (ARRAY['aircraft'::text, 'engine'::text, 'propeller'::text])),
  CONSTRAINT logbook_equipment_catalog_label_len CHECK ((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 200)),
  CONSTRAINT logbook_equipment_catalog_kind_normalized_unique UNIQUE (kind, normalized_label)
);

CREATE INDEX idx_logbook_equipment_catalog_kind_label ON public.logbook_equipment_catalog USING btree (kind, label);

COMMENT ON TABLE public.logbook_equipment_catalog IS
  'User-built glossary for aircraft / engine / propeller labels used on logbook entries; deduplicated by kind + case-insensitive trim.';

CREATE OR REPLACE FUNCTION public.logbook_equipment_catalog_set_normalized()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.normalized_label := lower(btrim(NEW.label));
  IF length(NEW.normalized_label) = 0 THEN
    RAISE EXCEPTION 'logbook_equipment_catalog: label cannot be empty';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_logbook_equipment_catalog_normalized
  BEFORE INSERT OR UPDATE OF label ON public.logbook_equipment_catalog
  FOR EACH ROW
  EXECUTE PROCEDURE public.logbook_equipment_catalog_set_normalized();

CREATE OR REPLACE FUNCTION public.ensure_logbook_equipment_catalog_label(p_kind text, p_label text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  t text := btrim(p_label);
BEGIN
  IF t IS NULL OR length(t) = 0 OR length(t) > 200 THEN
    RETURN;
  END IF;
  IF p_kind NOT IN ('aircraft', 'engine', 'propeller') THEN
    RETURN;
  END IF;

  INSERT INTO public.logbook_equipment_catalog (kind, label)
  VALUES (p_kind, t)
  ON CONFLICT (kind, normalized_label) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_logbook_equipment_catalog_label(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_logbook_equipment_catalog_label(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_logbook_equipment_catalog_label(text, text) TO service_role;

COMMENT ON FUNCTION public.ensure_logbook_equipment_catalog_label(text, text) IS
  'Idempotently register a catalog label for logbook equipment pick lists (bypasses direct INSERT RLS).';

ALTER TABLE public.logbook_equipment_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read logbook equipment catalog"
  ON public.logbook_equipment_catalog
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

GRANT SELECT ON TABLE public.logbook_equipment_catalog TO authenticated;
GRANT ALL ON TABLE public.logbook_equipment_catalog TO service_role;

-- Seed catalog from existing logbook text (best-effort).
DO $$
DECLARE
  r text;
BEGIN
  FOR r IN
    SELECT DISTINCT btrim(le.aircraft) AS v
    FROM public.logbook_entries le
    WHERE le.aircraft IS NOT NULL AND length(btrim(le.aircraft)) > 0
  LOOP
    PERFORM public.ensure_logbook_equipment_catalog_label('aircraft', r);
  END LOOP;

  FOR r IN
    SELECT DISTINCT btrim(le.additional_information->>'engine') AS v
    FROM public.logbook_entries le
    WHERE le.additional_information->>'engine' IS NOT NULL
      AND length(btrim(le.additional_information->>'engine')) > 0
  LOOP
    PERFORM public.ensure_logbook_equipment_catalog_label('engine', r);
  END LOOP;

  FOR r IN
    SELECT DISTINCT btrim(le.additional_information->>'propeller') AS v
    FROM public.logbook_entries le
    WHERE le.additional_information->>'propeller' IS NOT NULL
      AND length(btrim(le.additional_information->>'propeller')) > 0
  LOOP
    PERFORM public.ensure_logbook_equipment_catalog_label('propeller', r);
  END LOOP;
END;
$$;

COMMIT;
