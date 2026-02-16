-- acs_signoff: stores permanent mentor sign-offs for ACS codes.
-- Each row represents a mentor certifying that an apprentice has demonstrated
-- competency for a specific ACS code. This is separate from log entry approval.
--
-- Note: Uses profiles(id) for user references (app_user was removed in migration 025).

CREATE TABLE IF NOT EXISTS public.acs_signoff (
    id SERIAL PRIMARY KEY,
    acs_code_id INTEGER NOT NULL REFERENCES public.acs_code(id),
    apprentice_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    signer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    signed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    UNIQUE (acs_code_id, apprentice_user_id)
);

CREATE INDEX IF NOT EXISTS idx_acs_signoff_acs_code_id ON public.acs_signoff(acs_code_id);
CREATE INDEX IF NOT EXISTS idx_acs_signoff_apprentice_user_id ON public.acs_signoff(apprentice_user_id);
CREATE INDEX IF NOT EXISTS idx_acs_signoff_signer_id ON public.acs_signoff(signer_id);

-- RLS: authenticated users can read; mentors can insert for their apprentices
ALTER TABLE public.acs_signoff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read acs_signoff"
    ON public.acs_signoff FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Mentors can insert acs_signoff for their apprentices"
    ON public.acs_signoff FOR INSERT
    WITH CHECK (
        auth.uid() = signer_id
        AND EXISTS (
            SELECT 1 FROM public.apprentices a
            WHERE a.user_id = apprentice_user_id AND a.mentor_id = signer_id
        )
    );
