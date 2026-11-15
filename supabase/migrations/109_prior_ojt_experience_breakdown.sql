-- Total mechanic time and the airframe/engine periods collected on the first
-- page of Prior OJT. The skills profile reads the finished assessment through
-- a definer function so mentors can see it without opening the rest of the assessment.

BEGIN;

ALTER TABLE public.prior_ojt_assessments
    ADD COLUMN IF NOT EXISTS mechanic_experience_years integer,
    ADD COLUMN IF NOT EXISTS mechanic_experience_months integer;

ALTER TABLE public.prior_ojt_assessments
    DROP CONSTRAINT IF EXISTS prior_ojt_assessments_mechanic_years_check;

ALTER TABLE public.prior_ojt_assessments
    ADD CONSTRAINT prior_ojt_assessments_mechanic_years_check
        CHECK (mechanic_experience_years IS NULL OR mechanic_experience_years >= 0);

ALTER TABLE public.prior_ojt_assessments
    DROP CONSTRAINT IF EXISTS prior_ojt_assessments_mechanic_months_check;

ALTER TABLE public.prior_ojt_assessments
    ADD CONSTRAINT prior_ojt_assessments_mechanic_months_check
        CHECK (
            mechanic_experience_months IS NULL
            OR mechanic_experience_months BETWEEN 0 AND 11
        );

CREATE TABLE public.prior_ojt_experience_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    start_year integer NOT NULL,
    start_month integer NOT NULL,
    end_year integer NOT NULL,
    end_month integer NOT NULL,
    airframes text[] NOT NULL DEFAULT '{}'::text[],
    engines text[] NOT NULL DEFAULT '{}'::text[],
    CONSTRAINT prior_ojt_experience_lines_pkey PRIMARY KEY (id),
    CONSTRAINT prior_ojt_experience_lines_assessment_id_fkey
        FOREIGN KEY (assessment_id) REFERENCES public.prior_ojt_assessments(id) ON DELETE CASCADE,
    CONSTRAINT prior_ojt_experience_lines_start_month_check
        CHECK (start_month BETWEEN 1 AND 12),
    CONSTRAINT prior_ojt_experience_lines_end_month_check
        CHECK (end_month BETWEEN 1 AND 12),
    CONSTRAINT prior_ojt_experience_lines_span_check
        CHECK ((end_year * 12 + end_month) >= (start_year * 12 + start_month)),
    CONSTRAINT prior_ojt_experience_lines_equipment_check
        CHECK (cardinality(airframes) + cardinality(engines) >= 1)
);

CREATE INDEX idx_prior_ojt_experience_lines_assessment
    ON public.prior_ojt_experience_lines USING btree (assessment_id, sort_order);

ALTER TABLE public.prior_ojt_experience_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage experience lines on own prior OJT assessments"
    ON public.prior_ojt_experience_lines
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.prior_ojt_assessments a
            WHERE a.id = assessment_id AND a.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.prior_ojt_assessments a
            WHERE a.id = assessment_id AND a.user_id = auth.uid()
        )
    );

CREATE POLICY "Platform admins manage all prior OJT experience lines"
    ON public.prior_ojt_experience_lines
    FOR ALL
    TO authenticated
    USING (public.auth_is_platform_admin())
    WITH CHECK (public.auth_is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prior_ojt_experience_lines TO authenticated;
GRANT ALL ON public.prior_ojt_experience_lines TO service_role;

CREATE OR REPLACE FUNCTION public.prior_ojt_experience_for_skills_profile(p_owner_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
    v_assessment public.prior_ojt_assessments%ROWTYPE;
    v_lines jsonb;
BEGIN
    IF auth.uid() IS NULL OR NOT public.auth_can_view_skills_profile(p_owner_user_id) THEN
        RETURN NULL;
    END IF;

    SELECT *
    INTO v_assessment
    FROM public.prior_ojt_assessments
    WHERE user_id = p_owner_user_id
      AND status = ANY (ARRAY['completed', 'reviewing', 'accepted']::public.prior_ojt_assessment_status[])
    ORDER BY COALESCE(accepted_at, completed_at, updated_at) DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'startYear', line.start_year,
                'startMonth', line.start_month,
                'endYear', line.end_year,
                'endMonth', line.end_month,
                'airframes', line.airframes,
                'engines', line.engines
            )
            ORDER BY line.sort_order
        ),
        '[]'::jsonb
    )
    INTO v_lines
    FROM public.prior_ojt_experience_lines line
    WHERE line.assessment_id = v_assessment.id;

    RETURN jsonb_build_object(
        'years', COALESCE(v_assessment.mechanic_experience_years, 0),
        'months', COALESCE(v_assessment.mechanic_experience_months, 0),
        'lines', v_lines
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prior_ojt_experience_for_skills_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prior_ojt_experience_for_skills_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prior_ojt_experience_for_skills_profile(uuid) TO service_role;

COMMENT ON FUNCTION public.prior_ojt_experience_for_skills_profile(uuid) IS
    'Finished prior-OJT mechanic time and airframe/engine periods for an authorized skills-profile viewer.';

COMMIT;
