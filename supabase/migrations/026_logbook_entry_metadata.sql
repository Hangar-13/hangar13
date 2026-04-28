-- Optional logbook metadata: page number, aircraft, and extensible JSON for rare fields (engine, propeller, future keys).

ALTER TABLE public.logbook_entries
  ADD COLUMN IF NOT EXISTS log_page_number integer,
  ADD COLUMN IF NOT EXISTS aircraft text,
  ADD COLUMN IF NOT EXISTS additional_information jsonb;

COMMENT ON COLUMN public.logbook_entries.log_page_number IS 'Optional logbook page reference number.';
COMMENT ON COLUMN public.logbook_entries.aircraft IS 'Optional aircraft identification or description.';
COMMENT ON COLUMN public.logbook_entries.additional_information IS 'Optional extensible key-value data (e.g. engine, propeller).';
