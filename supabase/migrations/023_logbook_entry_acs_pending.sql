-- logbook_entry_acs_pending: stores apprentice-selected ACS codes for logbook_entries before mentor approval
CREATE TABLE IF NOT EXISTS public.logbook_entry_acs_pending (
    id SERIAL PRIMARY KEY,
    logbook_entry_id UUID NOT NULL REFERENCES public.logbook_entries(id) ON DELETE CASCADE,
    acs_code_id INTEGER NOT NULL REFERENCES public.acs_code(id),
    UNIQUE (logbook_entry_id, acs_code_id)
);

CREATE INDEX IF NOT EXISTS idx_logbook_entry_acs_pending_logbook_entry_id ON public.logbook_entry_acs_pending(logbook_entry_id);
CREATE INDEX IF NOT EXISTS idx_logbook_entry_acs_pending_acs_code_id ON public.logbook_entry_acs_pending(acs_code_id);

-- RLS: apprentices manage their own pending ACS codes
ALTER TABLE public.logbook_entry_acs_pending ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Apprentices can manage own logbook entry ACS pending"
  ON public.logbook_entry_acs_pending FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.logbook_entries le
      JOIN public.apprentices a ON a.id = le.apprentice_id
      WHERE le.id = logbook_entry_acs_pending.logbook_entry_id
        AND a.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.logbook_entries le
      JOIN public.apprentices a ON a.id = le.apprentice_id
      WHERE le.id = logbook_entry_acs_pending.logbook_entry_id
        AND a.user_id = auth.uid()
    )
  );

-- Mentors can read for their apprentices
CREATE POLICY "Mentors can view apprentice logbook entry ACS pending"
  ON public.logbook_entry_acs_pending FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.logbook_entries le
      JOIN public.apprentices a ON a.id = le.apprentice_id
      WHERE le.id = logbook_entry_acs_pending.logbook_entry_id
        AND a.mentor_id = auth.uid()
    )
  );
