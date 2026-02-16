-- log_entry_acs_pending: stores apprentice-selected ACS codes before mentor approval
-- When a mentor signs off a log entry, app logic copies pending rows to log_entry_acs and clears pending
CREATE TABLE IF NOT EXISTS public.log_entry_acs_pending (
    id SERIAL PRIMARY KEY,
    log_entry_id INTEGER NOT NULL REFERENCES public.log_entry(id) ON DELETE CASCADE,
    acs_code_id INTEGER NOT NULL REFERENCES public.acs_code(id),
    UNIQUE (log_entry_id, acs_code_id)
);

CREATE INDEX IF NOT EXISTS idx_log_entry_acs_pending_log_entry_id ON public.log_entry_acs_pending(log_entry_id);
CREATE INDEX IF NOT EXISTS idx_log_entry_acs_pending_acs_code_id ON public.log_entry_acs_pending(acs_code_id);
