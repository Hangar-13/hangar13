-- Completed trainings and awarded certifications (name + date), visible across the app.

CREATE TABLE public.user_training_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    training_name text NOT NULL,
    completed_on date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_training_completions_pkey PRIMARY KEY (id),
    CONSTRAINT user_training_completions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE TABLE public.user_certification_awards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    certification_name text NOT NULL,
    awarded_on date NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_certification_awards_pkey PRIMARY KEY (id),
    CONSTRAINT user_certification_awards_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_training_completions_user_id ON public.user_training_completions USING btree (user_id);
CREATE INDEX idx_user_training_completions_completed_on ON public.user_training_completions USING btree (completed_on DESC);
CREATE INDEX idx_user_certification_awards_user_id ON public.user_certification_awards USING btree (user_id);
CREATE INDEX idx_user_certification_awards_awarded_on ON public.user_certification_awards USING btree (awarded_on DESC);

CREATE TRIGGER update_user_training_completions_updated_at
    BEFORE UPDATE ON public.user_training_completions
    FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE TRIGGER update_user_certification_awards_updated_at
    BEFORE UPDATE ON public.user_certification_awards
    FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

ALTER TABLE public.user_training_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_certification_awards ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user (peers, mentors, etc.)
CREATE POLICY "Authenticated users can view training completions"
    ON public.user_training_completions FOR SELECT
    USING (auth.role() = 'authenticated'::text);

CREATE POLICY "Authenticated users can view certification awards"
    ON public.user_certification_awards FOR SELECT
    USING (auth.role() = 'authenticated'::text);

-- Own rows
CREATE POLICY "Users insert own training completions"
    ON public.user_training_completions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own training completions"
    ON public.user_training_completions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own training completions"
    ON public.user_training_completions FOR DELETE
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own certification awards"
    ON public.user_certification_awards FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own certification awards"
    ON public.user_certification_awards FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own certification awards"
    ON public.user_certification_awards FOR DELETE
    USING (auth.uid() = user_id);

-- Managers / gods: full access (INSERT/UPDATE/DELETE/SELECT)
CREATE POLICY "Managers and gods manage all training completions"
    ON public.user_training_completions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
        )
    );

CREATE POLICY "Managers and gods manage all certification awards"
    ON public.user_certification_awards
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
        )
    );
