-- Organizations: catalog ownership for courses and training_paths; users belong to zero or more orgs via user_organizations.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    lead_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT organizations_pkey PRIMARY KEY (id),
    CONSTRAINT organizations_lead_user_id_fkey FOREIGN KEY (lead_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.organizations IS 'Tenant-style grouping; courses and training_paths belong to exactly one organization.';
COMMENT ON COLUMN public.organizations.lead_user_id IS 'Primary contact / owner user for this organization (optional).';

-- ---------------------------------------------------------------------------
-- 2. user_organizations (many-to-many: users.organization_ids concept)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_organizations (
    user_id uuid NOT NULL,
    organization_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_organizations_pkey PRIMARY KEY (user_id, organization_id),
    CONSTRAINT user_organizations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT user_organizations_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_organizations_organization_id ON public.user_organizations USING btree (organization_id);

COMMENT ON TABLE public.user_organizations IS 'Organization membership; a user may belong to many organizations or none.';

-- ---------------------------------------------------------------------------
-- 3. courses & training_paths: exactly one owning organization
-- ---------------------------------------------------------------------------
ALTER TABLE public.courses
    ADD COLUMN organization_id uuid;

ALTER TABLE public.training_paths
    ADD COLUMN organization_id uuid;

DO $$
DECLARE
    v_org_id uuid;
BEGIN
    SELECT id INTO v_org_id FROM public.organizations ORDER BY created_at LIMIT 1;
    IF v_org_id IS NULL THEN
        INSERT INTO public.organizations (name) VALUES ('Default organization') RETURNING id INTO v_org_id;
    END IF;
    UPDATE public.courses SET organization_id = v_org_id WHERE organization_id IS NULL;
    UPDATE public.training_paths SET organization_id = v_org_id WHERE organization_id IS NULL;
END $$;

ALTER TABLE public.courses
    ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.training_paths
    ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.courses
    ADD CONSTRAINT courses_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.training_paths
    ADD CONSTRAINT training_paths_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE INDEX idx_courses_organization_id ON public.courses USING btree (organization_id);
CREATE INDEX idx_training_paths_organization_id ON public.training_paths USING btree (organization_id);

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view organizations"
    ON public.organizations FOR SELECT
    USING ((auth.role() = 'authenticated'::text));

CREATE POLICY "Mentors and above can manage organizations"
    ON public.organizations
    FOR ALL
    USING ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ))
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
      )
    ));

CREATE POLICY "Users can view own organization memberships"
    ON public.user_organizations FOR SELECT
    USING ((auth.uid() = user_id));

CREATE POLICY "Managers and gods can view all organization memberships"
    ON public.user_organizations FOR SELECT
    USING ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
      )
    ));

CREATE POLICY "Managers and gods can insert organization memberships"
    ON public.user_organizations FOR INSERT
    TO authenticated
    WITH CHECK ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
      )
    ));

CREATE POLICY "Managers and gods can delete organization memberships"
    ON public.user_organizations FOR DELETE
    TO authenticated
    USING ((
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid() AND u.role = ANY (ARRAY['manager'::text, 'god'::text])
      )
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.user_organizations TO service_role;

COMMIT;
