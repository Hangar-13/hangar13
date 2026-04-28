-- Licensed training material (courses + training paths) per organization.

BEGIN;

CREATE TABLE public.organization_training_entitlements (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  course_id uuid,
  training_path_id uuid,
  licenses_purchased integer NOT NULL DEFAULT 0,
  expires_at date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organization_training_entitlements_pkey PRIMARY KEY (id),
  CONSTRAINT organization_training_entitlements_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT organization_training_entitlements_course_id_fkey
    FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE,
  CONSTRAINT organization_training_entitlements_training_path_id_fkey
    FOREIGN KEY (training_path_id) REFERENCES public.training_paths(id) ON DELETE CASCADE,
  CONSTRAINT organization_training_entitlements_one_target CHECK (
    (course_id IS NOT NULL AND training_path_id IS NULL)
    OR (course_id IS NULL AND training_path_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX uq_organization_training_entitlements_org_course
  ON public.organization_training_entitlements(organization_id, course_id)
  WHERE course_id IS NOT NULL;

CREATE UNIQUE INDEX uq_organization_training_entitlements_org_path
  ON public.organization_training_entitlements(organization_id, training_path_id)
  WHERE training_path_id IS NOT NULL;

CREATE INDEX idx_organization_training_entitlements_org
  ON public.organization_training_entitlements(organization_id);

CREATE TRIGGER update_organization_training_entitlements_updated_at
  BEFORE UPDATE ON public.organization_training_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.organization_training_entitlements IS
  'Per-org entitlements: licenses purchased and expiration for a course or training path. The app LEFT JOINs catalog rows so missing rows show as 0 / no expiry.';

ALTER TABLE public.organization_training_entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and gods can view org training entitlements"
  ON public.organization_training_entitlements
  FOR SELECT
  TO authenticated
  USING ((public.auth_has_manager_or_god_in_any_org()));

CREATE POLICY "Managers and gods can manage org training entitlements"
  ON public.organization_training_entitlements
  FOR ALL
  TO authenticated
  USING ((public.auth_has_manager_or_god_in_any_org()))
  WITH CHECK ((public.auth_has_manager_or_god_in_any_org()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_training_entitlements TO authenticated;
GRANT ALL ON public.organization_training_entitlements TO service_role;

COMMIT;
