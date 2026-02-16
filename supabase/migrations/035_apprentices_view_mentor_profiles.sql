-- Allow apprentices to view their mentor's profile (e.g. for ACS sign-off display)
CREATE POLICY "Apprentices can view mentor profile"
    ON public.profiles FOR SELECT
    USING (
        id IN (
            SELECT mentor_id FROM public.apprentices
            WHERE user_id = auth.uid() AND mentor_id IS NOT NULL
        )
    );
