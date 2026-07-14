-- External certifications earned outside Hangar13 (forklift, factory school, etc.)
-- with optional document proof (photo/PDF).

BEGIN;

CREATE TYPE public.external_certification_type AS ENUM (
  'forklift_operator',
  'factory_school',
  'safety_training',
  'employer_training',
  'professional_license',
  'other'
);

CREATE TABLE public.user_external_certifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  certification_type public.external_certification_type NOT NULL,
  certification_type_other text,
  name text NOT NULL,
  awarded_on date NOT NULL,
  expires_on date,
  issuing_organization text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_external_certifications_pkey PRIMARY KEY (id),
  CONSTRAINT user_external_certifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_external_certifications_type_other_check CHECK (
    certification_type <> 'other'::public.external_certification_type
    OR (certification_type_other IS NOT NULL AND btrim(certification_type_other) <> '')
  ),
  CONSTRAINT user_external_certifications_expires_after_awarded_check CHECK (
    expires_on IS NULL OR expires_on >= awarded_on
  )
);

CREATE TABLE public.user_external_certification_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  external_certification_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer NOT NULL,
  file_type text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_external_certification_documents_pkey PRIMARY KEY (id),
  CONSTRAINT user_external_certification_documents_cert_fkey
    FOREIGN KEY (external_certification_id)
    REFERENCES public.user_external_certifications(id) ON DELETE CASCADE,
  CONSTRAINT user_external_certification_documents_one_per_cert UNIQUE (external_certification_id)
);

CREATE INDEX idx_user_external_certifications_user_id
  ON public.user_external_certifications USING btree (user_id);
CREATE INDEX idx_user_external_certifications_awarded_on
  ON public.user_external_certifications USING btree (awarded_on DESC);
CREATE INDEX idx_user_external_certification_documents_cert_id
  ON public.user_external_certification_documents USING btree (external_certification_id);

CREATE TRIGGER update_user_external_certifications_updated_at
  BEFORE UPDATE ON public.user_external_certifications
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

ALTER TABLE public.user_external_certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_external_certification_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view external certifications"
  ON public.user_external_certifications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users insert own external certifications"
  ON public.user_external_certifications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own external certifications"
  ON public.user_external_certifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own external certifications"
  ON public.user_external_certifications FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Platform admins manage all external certifications"
  ON public.user_external_certifications
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

CREATE POLICY "Authenticated users can view external certification documents"
  ON public.user_external_certification_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users manage documents for own external certifications"
  ON public.user_external_certification_documents
  FOR ALL
  TO authenticated
  USING ((
    EXISTS (
      SELECT 1 FROM public.user_external_certifications c
      WHERE c.id = user_external_certification_documents.external_certification_id
        AND c.user_id = auth.uid()
    )
  ))
  WITH CHECK ((
    EXISTS (
      SELECT 1 FROM public.user_external_certifications c
      WHERE c.id = user_external_certification_documents.external_certification_id
        AND c.user_id = auth.uid()
    )
  ));

CREATE POLICY "Platform admins manage all external certification documents"
  ON public.user_external_certification_documents
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_external_certifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_external_certification_documents TO authenticated;
GRANT ALL ON public.user_external_certifications TO service_role;
GRANT ALL ON public.user_external_certification_documents TO service_role;

-- Storage bucket for certificate photos/PDFs (public read, like weekly-submissions).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'external-certifications',
  'external-certifications',
  true,
  10485760,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own external certification files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'external-certifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users read external certification files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'external-certifications');

CREATE POLICY "Users update own external certification files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'external-certifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'external-certifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own external certification files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'external-certifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
