-- Per-organization roles on user_organizations. Effective platform role (navigation) = max role across memberships; no rows = student.

BEGIN;

ALTER TABLE public.user_organizations
    ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student';

ALTER TABLE public.user_organizations
    DROP CONSTRAINT IF EXISTS user_organizations_role_check;

ALTER TABLE public.user_organizations
    ADD CONSTRAINT user_organizations_role_check
    CHECK (role = ANY (ARRAY['student'::text, 'mentor'::text, 'manager'::text, 'god'::text]));

COMMENT ON COLUMN public.user_organizations.role IS 'Role of this user within the organization (student, mentor, manager, god).';

-- Existing memberships: copy global users.role where valid
UPDATE public.user_organizations uo
SET role = u.role
FROM public.users u
WHERE uo.user_id = u.id
  AND u.role = ANY (ARRAY['student'::text, 'mentor'::text, 'manager'::text, 'god'::text]);

UPDATE public.user_organizations
SET role = 'student'
WHERE role IS NULL OR role NOT IN ('student', 'mentor', 'manager', 'god');

-- Elevated users with no membership: attach to earliest org (bootstrap)
INSERT INTO public.user_organizations (user_id, organization_id, role)
SELECT u.id, o.id, u.role
FROM public.users u
CROSS JOIN LATERAL (
    SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1
) o
WHERE u.role = ANY (ARRAY['mentor'::text, 'manager'::text, 'god'::text])
  AND NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo WHERE uo.user_id = u.id
  )
ON CONFLICT DO NOTHING;

-- Keep public.users.role aligned with max(org role) for middleware and legacy checks
CREATE OR REPLACE FUNCTION public.sync_users_role_from_memberships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_level int;
  v_role text;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT COALESCE(MAX(
    CASE uo.role
      WHEN 'student' THEN 1
      WHEN 'mentor' THEN 2
      WHEN 'manager' THEN 3
      WHEN 'god' THEN 4
      ELSE 1
    END
  ), 0)
  INTO v_level
  FROM public.user_organizations uo
  WHERE uo.user_id = v_user_id;

  IF v_level = 0 THEN
    v_role := 'student';
  ELSE
    v_role := CASE v_level
      WHEN 4 THEN 'god'
      WHEN 3 THEN 'manager'
      WHEN 2 THEN 'mentor'
      ELSE 'student'
    END;
  END IF;

  UPDATE public.users SET role = v_role WHERE id = v_user_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_users_role_after_membership ON public.user_organizations;

CREATE TRIGGER trg_sync_users_role_after_membership
    AFTER INSERT OR UPDATE OR DELETE ON public.user_organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_users_role_from_memberships();

-- One-shot: recompute all users.role from memberships
UPDATE public.users u
SET role = sub.r
FROM (
    SELECT user_id,
        CASE COALESCE(MAX(
            CASE role
                WHEN 'student' THEN 1
                WHEN 'mentor' THEN 2
                WHEN 'manager' THEN 3
                WHEN 'god' THEN 4
                ELSE 1
            END
        ), 0)
            WHEN 0 THEN 'student'
            WHEN 4 THEN 'god'
            WHEN 3 THEN 'manager'
            WHEN 2 THEN 'mentor'
            ELSE 'student'
        END AS r
    FROM public.user_organizations
    GROUP BY user_id
) sub
WHERE u.id = sub.user_id;

UPDATE public.users u
SET role = 'student'
WHERE NOT EXISTS (
    SELECT 1 FROM public.user_organizations uo WHERE uo.user_id = u.id
);

COMMIT;
