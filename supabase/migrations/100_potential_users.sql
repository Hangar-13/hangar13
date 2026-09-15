-- Mailing-list leads captured from the public landing page.
-- Touchpoints and notes are first-class rows (not JSON arrays) so follow-up
-- queries, unsubscribes, and a later drip cron can filter without rewriting blobs.

BEGIN;

CREATE TABLE public.potential_users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  audience text NOT NULL,
  is_veteran boolean NOT NULL DEFAULT false,
  signup_date timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new',
  unsubscribed_at timestamp with time zone,
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  next_follow_up_at timestamp with time zone,
  sequence_key text,
  sequence_step integer NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'landing_mailing_list',
  converted_user_id uuid,
  external_crm_id text,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT potential_users_pkey PRIMARY KEY (id),
  CONSTRAINT potential_users_email_key UNIQUE (email),
  CONSTRAINT potential_users_unsubscribe_token_key UNIQUE (unsubscribe_token),
  CONSTRAINT potential_users_audience_check CHECK (audience IN ('mechanic', 'operator')),
  CONSTRAINT potential_users_status_check CHECK (
    status IN ('new', 'nurturing', 'converted', 'unsubscribed')
  ),
  CONSTRAINT potential_users_sequence_step_check CHECK (sequence_step >= 0),
  CONSTRAINT potential_users_full_name_check CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 120),
  CONSTRAINT potential_users_email_format_check CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  CONSTRAINT potential_users_converted_user_id_fkey
    FOREIGN KEY (converted_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.potential_users IS
  'Landing-page mailing list leads (not Hangar13 accounts). Status + next_follow_up_at drive later drip sends; external_crm_id is reserved for an optional HubSpot (or similar) sync.';

COMMENT ON COLUMN public.potential_users.signup_date IS
  'When they joined the mailing list.';

COMMENT ON COLUMN public.potential_users.next_follow_up_at IS
  'When the next automated outreach is due. NULL means no send is scheduled.';

COMMENT ON COLUMN public.potential_users.external_crm_id IS
  'Remote contact id if we later sync this lead to HubSpot or another CRM.';

CREATE TABLE public.potential_user_touchpoints (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  potential_user_id uuid NOT NULL,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  body text NOT NULL,
  kind text NOT NULL DEFAULT 'other',
  channel text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT potential_user_touchpoints_pkey PRIMARY KEY (id),
  CONSTRAINT potential_user_touchpoints_potential_user_id_fkey
    FOREIGN KEY (potential_user_id) REFERENCES public.potential_users(id) ON DELETE CASCADE,
  CONSTRAINT potential_user_touchpoints_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  CONSTRAINT potential_user_touchpoints_kind_check CHECK (
    kind IN (
      'signup',
      'email_sent',
      'email_opened',
      'email_clicked',
      'email_replied',
      'call',
      'meeting',
      'form',
      'other'
    )
  ),
  CONSTRAINT potential_user_touchpoints_channel_check CHECK (
    channel IS NULL OR channel IN ('email', 'phone', 'in_person', 'web', 'other')
  )
);

COMMENT ON TABLE public.potential_user_touchpoints IS
  'Customer-facing interactions with a lead (emails sent, replies, calls). Queryable by date/kind so drip jobs do not scan JSON arrays.';

CREATE TABLE public.potential_user_notes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  potential_user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT potential_user_notes_pkey PRIMARY KEY (id),
  CONSTRAINT potential_user_notes_potential_user_id_fkey
    FOREIGN KEY (potential_user_id) REFERENCES public.potential_users(id) ON DELETE CASCADE,
  CONSTRAINT potential_user_notes_body_check CHECK (char_length(btrim(body)) BETWEEN 1 AND 8000),
  CONSTRAINT potential_user_notes_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.potential_user_notes IS
  'Internal staff notes about a lead. Not shown to the visitor and not used to trigger sends.';

CREATE INDEX idx_potential_users_signup_date
  ON public.potential_users USING btree (signup_date DESC);

CREATE INDEX idx_potential_users_status
  ON public.potential_users USING btree (status);

CREATE INDEX idx_potential_users_next_follow_up
  ON public.potential_users USING btree (next_follow_up_at)
  WHERE unsubscribed_at IS NULL AND status IN ('new', 'nurturing');

CREATE INDEX idx_potential_user_touchpoints_user_occurred
  ON public.potential_user_touchpoints USING btree (potential_user_id, occurred_at DESC);

CREATE INDEX idx_potential_user_notes_user_created
  ON public.potential_user_notes USING btree (potential_user_id, created_at DESC);

CREATE TRIGGER update_potential_users_updated_at
  BEFORE UPDATE ON public.potential_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Array-shaped read model matching { date, text } objects, without storing arrays.
CREATE VIEW public.potential_users_with_history
  WITH (security_invoker = true)
AS
SELECT
  pu.*,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', t.occurred_at,
        'text', t.body,
        'kind', t.kind,
        'channel', t.channel
      )
      ORDER BY t.occurred_at
    )
    FROM public.potential_user_touchpoints t
    WHERE t.potential_user_id = pu.id
  ), '[]'::jsonb) AS touchpoints,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', n.created_at,
        'text', n.body
      )
      ORDER BY n.created_at
    )
    FROM public.potential_user_notes n
    WHERE n.potential_user_id = pu.id
  ), '[]'::jsonb) AS notes
FROM public.potential_users pu;

COMMENT ON VIEW public.potential_users_with_history IS
  'potential_users plus touchpoints/notes as JSON arrays ({ date, text }) for admin reads.';

CREATE OR REPLACE FUNCTION public.create_potential_user_from_landing(
  p_full_name text,
  p_email text,
  p_audience text,
  p_is_veteran boolean
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_email text;
  v_name text;
BEGIN
  v_name := btrim(COALESCE(p_full_name, ''));
  v_email := lower(btrim(COALESCE(p_email, '')));

  IF char_length(v_name) < 1 OR char_length(v_name) > 120 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  IF v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR char_length(v_email) > 254 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  IF p_audience IS NULL OR p_audience NOT IN ('mechanic', 'operator') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_audience');
  END IF;

  INSERT INTO public.potential_users (full_name, email, audience, is_veteran, source)
  VALUES (v_name, v_email, p_audience, COALESCE(p_is_veteran, false), 'landing_mailing_list')
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_joined', true);
  END IF;

  INSERT INTO public.potential_user_touchpoints (
    potential_user_id,
    occurred_at,
    body,
    kind,
    channel
  ) VALUES (
    v_id,
    now(),
    'Joined the mailing list from the public landing page.',
    'signup',
    'web'
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'already_joined', false);
END;
$$;

COMMENT ON FUNCTION public.create_potential_user_from_landing(text, text, text, boolean) IS
  'Public landing-page join. Called from a server action with the service role so anon cannot insert PII directly.';

REVOKE ALL ON FUNCTION public.create_potential_user_from_landing(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_potential_user_from_landing(text, text, text, boolean) TO service_role;

ALTER TABLE public.potential_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.potential_user_touchpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.potential_user_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins manage potential users"
  ON public.potential_users
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

CREATE POLICY "Platform admins manage potential user touchpoints"
  ON public.potential_user_touchpoints
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

CREATE POLICY "Platform admins manage potential user notes"
  ON public.potential_user_notes
  FOR ALL
  TO authenticated
  USING (public.auth_is_platform_admin())
  WITH CHECK (public.auth_is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.potential_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.potential_user_touchpoints TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.potential_user_notes TO authenticated;
GRANT SELECT ON public.potential_users_with_history TO authenticated;

GRANT ALL ON public.potential_users TO service_role;
GRANT ALL ON public.potential_user_touchpoints TO service_role;
GRANT ALL ON public.potential_user_notes TO service_role;
GRANT SELECT ON public.potential_users_with_history TO service_role;

COMMIT;
