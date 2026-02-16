-- Allow authenticated users to read ata_chapter (reference data)
ALTER TABLE public.ata_chapter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ata_chapter"
  ON public.ata_chapter FOR SELECT
  USING (auth.uid() IS NOT NULL);
