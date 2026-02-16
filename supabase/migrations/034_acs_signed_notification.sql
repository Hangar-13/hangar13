-- Add acs_signed to notification types and create RPC for ACS sign-off notifications
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('logs_awaiting', 'logs_approved', 'logs_rejected', 'acs_signed'));

-- RPC to create a notification when a mentor signs an ACS code for an apprentice
CREATE OR REPLACE FUNCTION public.create_acs_signed_notification(
  p_recipient_user_id UUID,
  p_subject_user_id UUID,
  p_subject_display_name TEXT,
  p_message TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_count INT;
BEGIN
  INSERT INTO public.notifications (
    recipient_user_id,
    type,
    subject_user_id,
    message,
    log_count,
    log_entry_ids
  ) VALUES (
    p_recipient_user_id,
    'acs_signed',
    p_subject_user_id,
    COALESCE(NULLIF(TRIM(p_message), ''), 'ACS code signed'),
    1,
    ARRAY[]::UUID[]
  )
  ON CONFLICT (recipient_user_id, type, subject_user_id) DO UPDATE SET
    message = (notifications.log_count + 1)::TEXT || ' ACS codes signed by ' || COALESCE(NULLIF(TRIM(p_subject_display_name), ''), 'your mentor'),
    log_count = notifications.log_count + 1,
    updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_acs_signed_notification(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_acs_signed_notification(UUID, UUID, TEXT, TEXT) TO anon;
