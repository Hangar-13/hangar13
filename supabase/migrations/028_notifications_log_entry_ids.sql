-- Add log_entry_ids to notifications for opening specific log modals
ALTER TABLE public.notifications
ADD COLUMN IF NOT EXISTS log_entry_ids UUID[] DEFAULT '{}';
