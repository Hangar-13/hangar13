-- Allow authenticated users to read acs_code (reference data)
ALTER TABLE public.acs_code ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read acs_code"
  ON public.acs_code FOR SELECT
  USING (auth.uid() IS NOT NULL);
