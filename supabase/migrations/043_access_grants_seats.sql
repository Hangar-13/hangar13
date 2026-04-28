-- Checkout grants, org seat occupancy (Stripe-aligned periods), user_trainings links.
-- Extends organization_training_entitlements for subscription window metadata.

BEGIN;

-- ---------------------------------------------------------------------------
-- organization_training_entitlements: Stripe / subscription anchors
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_training_entitlements
  ADD COLUMN IF NOT EXISTS current_period_start timestamp with time zone;

ALTER TABLE public.organization_training_entitlements
  ADD COLUMN IF NOT EXISTS current_period_end timestamp with time zone;

ALTER TABLE public.organization_training_entitlements
  ADD COLUMN IF NOT EXISTS external_subscription_id text;

COMMENT ON COLUMN public.organization_training_entitlements.current_period_start IS
  'Optional: synced billing period start (e.g. Stripe subscription).';

COMMENT ON COLUMN public.organization_training_entitlements.current_period_end IS
  'Optional: synced billing period end; seat rows should align to this window when relevant.';

-- ---------------------------------------------------------------------------
-- user_training_access_grants: every enroll creates a grant (incl. $0 free)
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_training_access_grants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  training_path_id uuid NOT NULL,
  grant_kind public.path_monetization NOT NULL,
  valid_from timestamp with time zone NOT NULL DEFAULT now(),
  valid_until timestamp with time zone,
  external_subscription_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_training_access_grants_pkey PRIMARY KEY (id),
  CONSTRAINT user_training_access_grants_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT user_training_access_grants_training_path_id_fkey
    FOREIGN KEY (training_path_id) REFERENCES public.training_paths(id) ON DELETE CASCADE
);

CREATE INDEX idx_user_training_access_grants_user
  ON public.user_training_access_grants USING btree (user_id);

CREATE INDEX idx_user_training_access_grants_path
  ON public.user_training_access_grants USING btree (training_path_id);

CREATE TRIGGER update_user_training_access_grants_updated_at
  BEFORE UPDATE ON public.user_training_access_grants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.user_training_access_grants IS
  'Proof of checkout per user/path; free paths use grant_kind=free and optional null valid_until.';

ALTER TABLE public.user_training_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own access grants"
  ON public.user_training_access_grants FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Managers and gods read all access grants"
  ON public.user_training_access_grants FOR SELECT
  TO authenticated
  USING (public.auth_has_manager_or_god_in_any_org());

CREATE POLICY "Users insert own access grants"
  ON public.user_training_access_grants FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Managers and gods manage access grants"
  ON public.user_training_access_grants FOR ALL
  TO authenticated
  USING (public.auth_has_manager_or_god_in_any_org())
  WITH CHECK (public.auth_has_manager_or_god_in_any_org());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_training_access_grants TO authenticated;
GRANT ALL ON public.user_training_access_grants TO service_role;

-- ---------------------------------------------------------------------------
-- organization_training_seat_occupancies
-- ---------------------------------------------------------------------------
CREATE TABLE public.organization_training_seat_occupancies (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_training_entitlement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  period_start timestamp with time zone NOT NULL,
  period_end timestamp with time zone NOT NULL,
  user_training_id uuid,
  released_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT organization_training_seat_occupancies_pkey PRIMARY KEY (id),
  CONSTRAINT organization_training_seat_occupancies_entitlement_fkey
    FOREIGN KEY (organization_training_entitlement_id)
    REFERENCES public.organization_training_entitlements(id) ON DELETE CASCADE,
  CONSTRAINT organization_training_seat_occupancies_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT organization_training_seat_occupancies_user_training_id_fkey
    FOREIGN KEY (user_training_id) REFERENCES public.user_trainings(id) ON DELETE SET NULL,
  CONSTRAINT organization_training_seat_occupancies_period_chk
    CHECK (period_end > period_start)
);

CREATE UNIQUE INDEX uq_seat_occupancy_entitlement_user_period
  ON public.organization_training_seat_occupancies (
    organization_training_entitlement_id,
    user_id,
    period_start
  )
  WHERE released_at IS NULL;

CREATE INDEX idx_seat_occupancies_entitlement
  ON public.organization_training_seat_occupancies (organization_training_entitlement_id);

COMMENT ON TABLE public.organization_training_seat_occupancies IS
  'One seat for one user for one billing period; capacity enforced in application layer.';

ALTER TABLE public.organization_training_seat_occupancies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers and gods manage seat occupancies"
  ON public.organization_training_seat_occupancies FOR ALL
  TO authenticated
  USING (public.auth_has_manager_or_god_in_any_org())
  WITH CHECK (public.auth_has_manager_or_god_in_any_org());

CREATE POLICY "Users read own seat occupancies"
  ON public.organization_training_seat_occupancies FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_training_seat_occupancies TO authenticated;
GRANT ALL ON public.organization_training_seat_occupancies TO service_role;

-- ---------------------------------------------------------------------------
-- user_trainings: enrollment proof (optional seat for org pools)
-- ---------------------------------------------------------------------------
CREATE TYPE public.user_training_enrollment_source AS ENUM (
  'self_service',
  'manager_assigned',
  'system'
);

ALTER TABLE public.user_trainings
  ADD COLUMN IF NOT EXISTS enrollment_source public.user_training_enrollment_source;

ALTER TABLE public.user_trainings
  ADD COLUMN IF NOT EXISTS user_access_grant_id uuid;

ALTER TABLE public.user_trainings
  ADD COLUMN IF NOT EXISTS seat_occupancy_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_trainings_user_access_grant_id_fkey'
  ) THEN
    ALTER TABLE public.user_trainings
      ADD CONSTRAINT user_trainings_user_access_grant_id_fkey
      FOREIGN KEY (user_access_grant_id)
      REFERENCES public.user_training_access_grants(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_trainings_seat_occupancy_id_fkey'
  ) THEN
    ALTER TABLE public.user_trainings
      ADD CONSTRAINT user_trainings_seat_occupancy_id_fkey
      FOREIGN KEY (seat_occupancy_id)
      REFERENCES public.organization_training_seat_occupancies(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.user_trainings.enrollment_source IS
  'How the enrollment row was created.';
COMMENT ON COLUMN public.user_trainings.user_access_grant_id IS
  'Checkout grant (including free); primary proof for self-serve.';
COMMENT ON COLUMN public.user_trainings.seat_occupancy_id IS
  'Optional org pool seat when enrollment is org-funded.';

CREATE INDEX IF NOT EXISTS idx_user_trainings_access_grant
  ON public.user_trainings (user_access_grant_id)
  WHERE user_access_grant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_trainings_seat
  ON public.user_trainings (seat_occupancy_id)
  WHERE seat_occupancy_id IS NOT NULL;

COMMIT;
