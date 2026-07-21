-- Prior OJT Experience assessments: guided ACS claims + proposed logbook entries
-- before the student accepts them into the real logbook.

BEGIN;

CREATE TYPE public.prior_ojt_assessment_status AS ENUM (
  'in_progress',
  'completed',
  'reviewing',
  'accepted'
);

CREATE TYPE public.prior_ojt_proposed_entry_status AS ENUM (
  'pending',
  'removed',
  'accepted'
);

CREATE TABLE public.prior_ojt_assessments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  full_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  backgrounds text[] NOT NULL DEFAULT '{}'::text[],
  summary text,
  selected_domains text[] NOT NULL DEFAULT '{}'::text[],
  status public.prior_ojt_assessment_status NOT NULL DEFAULT 'in_progress',
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  accepted_at timestamp with time zone,
  CONSTRAINT prior_ojt_assessments_pkey PRIMARY KEY (id),
  CONSTRAINT prior_ojt_assessments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT prior_ojt_assessments_domains_check CHECK (
    selected_domains <@ ARRAY['general', 'airframe', 'powerplant']::text[]
  )
);

CREATE TABLE public.prior_ojt_claims (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  assessment_id uuid NOT NULL,
  acs_code_id integer NOT NULL,
  evidence_types text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT prior_ojt_claims_pkey PRIMARY KEY (id),
  CONSTRAINT prior_ojt_claims_assessment_id_fkey
    FOREIGN KEY (assessment_id) REFERENCES public.prior_ojt_assessments(id) ON DELETE CASCADE,
  CONSTRAINT prior_ojt_claims_acs_code_id_fkey
    FOREIGN KEY (acs_code_id) REFERENCES public.acs_code(id) ON DELETE CASCADE,
  CONSTRAINT prior_ojt_claims_assessment_acs_unique UNIQUE (assessment_id, acs_code_id),
  CONSTRAINT prior_ojt_claims_evidence_not_empty CHECK (
    cardinality(evidence_types) > 0
  )
);

CREATE TABLE public.prior_ojt_proposed_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  assessment_id uuid NOT NULL,
  entry_date date NOT NULL,
  hours_worked numeric(6, 2) NOT NULL DEFAULT 1.00,
  description text NOT NULL,
  ata_chapter_number text,
  acs_code_ids integer[] NOT NULL DEFAULT '{}'::integer[],
  domain text,
  subject_letter text,
  subject text,
  evidence_types text[] NOT NULL DEFAULT '{}'::text[],
  status public.prior_ojt_proposed_entry_status NOT NULL DEFAULT 'pending',
  logbook_entry_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT prior_ojt_proposed_entries_pkey PRIMARY KEY (id),
  CONSTRAINT prior_ojt_proposed_entries_assessment_id_fkey
    FOREIGN KEY (assessment_id) REFERENCES public.prior_ojt_assessments(id) ON DELETE CASCADE,
  CONSTRAINT prior_ojt_proposed_entries_logbook_entry_id_fkey
    FOREIGN KEY (logbook_entry_id) REFERENCES public.logbook_entries(id) ON DELETE SET NULL,
  CONSTRAINT prior_ojt_proposed_entries_hours_check CHECK (hours_worked > 0),
  CONSTRAINT prior_ojt_proposed_entries_domain_check CHECK (
    domain IS NULL OR domain = ANY (ARRAY['general', 'airframe', 'powerplant']::text[])
  )
);

CREATE INDEX idx_prior_ojt_assessments_user_id
  ON public.prior_ojt_assessments USING btree (user_id);
CREATE INDEX idx_prior_ojt_assessments_user_status
  ON public.prior_ojt_assessments USING btree (user_id, status);
CREATE INDEX idx_prior_ojt_claims_assessment_id
  ON public.prior_ojt_claims USING btree (assessment_id);
CREATE INDEX idx_prior_ojt_proposed_entries_assessment_id
  ON public.prior_ojt_proposed_entries USING btree (assessment_id);

CREATE TRIGGER update_prior_ojt_assessments_updated_at
  BEFORE UPDATE ON public.prior_ojt_assessments
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE TRIGGER update_prior_ojt_claims_updated_at
  BEFORE UPDATE ON public.prior_ojt_claims
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

CREATE TRIGGER update_prior_ojt_proposed_entries_updated_at
  BEFORE UPDATE ON public.prior_ojt_proposed_entries
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

ALTER TABLE public.prior_ojt_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prior_ojt_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prior_ojt_proposed_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own prior OJT assessments"
  ON public.prior_ojt_assessments
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Platform admins manage all prior OJT assessments"
  ON public.prior_ojt_assessments
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

CREATE POLICY "Users manage claims on own prior OJT assessments"
  ON public.prior_ojt_claims
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

CREATE POLICY "Platform admins manage all prior OJT claims"
  ON public.prior_ojt_claims
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

CREATE POLICY "Users manage proposed entries on own prior OJT assessments"
  ON public.prior_ojt_proposed_entries
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

CREATE POLICY "Platform admins manage all prior OJT proposed entries"
  ON public.prior_ojt_proposed_entries
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

COMMIT;
