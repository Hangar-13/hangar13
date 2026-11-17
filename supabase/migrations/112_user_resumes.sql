-- One resume per user, shown on the skills profile and uploaded from Prior OJT.

BEGIN;

CREATE TABLE public.user_resumes (
  user_id uuid NOT NULL,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer NOT NULL,
  file_type text,
  storage_path text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_resumes_pkey PRIMARY KEY (user_id),
  CONSTRAINT user_resumes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_resumes_file_size_check CHECK (file_size > 0 AND file_size <= 10485760)
);

CREATE TRIGGER update_user_resumes_updated_at
  BEFORE UPDATE ON public.user_resumes
  FOR EACH ROW EXECUTE PROCEDURE public.update_updated_at_column();

ALTER TABLE public.user_resumes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Skills profile viewers can read resumes"
  ON public.user_resumes
  FOR SELECT
  TO authenticated
  USING (public.auth_can_view_skills_profile(user_id));

CREATE POLICY "Users manage own resume"
  ON public.user_resumes
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Platform admins manage all resumes"
  ON public.user_resumes
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_resumes TO authenticated;
GRANT ALL ON public.user_resumes TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-resumes',
  'user-resumes',
  true,
  10485760,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own resume files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'user-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Authenticated users read resume files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'user-resumes');

CREATE POLICY "Users update own resume files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'user-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users delete own resume files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'user-resumes'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;
