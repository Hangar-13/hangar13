-- Public marketing landing copy/pricing, editable by platform admins in-app.

BEGIN;

CREATE TABLE public.marketing_pages (
  slug text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT marketing_pages_pkey PRIMARY KEY (slug),
  CONSTRAINT marketing_pages_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.marketing_pages IS
  'JSON copy and pricing for public marketing pages. Edited from Admin → Landing page.';

INSERT INTO public.marketing_pages (slug, content)
VALUES ('home', '{}'::jsonb);

ALTER TABLE public.marketing_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read marketing pages"
  ON public.marketing_pages
  FOR SELECT
  USING (true);

CREATE POLICY "Platform admins can update marketing pages"
  ON public.marketing_pages
  FOR UPDATE
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

GRANT SELECT ON public.marketing_pages TO anon, authenticated, service_role;
GRANT UPDATE ON public.marketing_pages TO authenticated, service_role;

COMMIT;
