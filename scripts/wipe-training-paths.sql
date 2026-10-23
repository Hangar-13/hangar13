-- One-off wipe: remove all training paths and enrollment associations.
-- NOT a migration — do not add this to supabase/migrations.
--
-- Uses DELETE (not TRUNCATE CASCADE) because users.current_user_training_id
-- references user_trainings; CASCADE truncate would wipe the users table.
--
-- Keeps: users, organizations, logbook, credentials, ACS/ATA catalogs.
--
-- Run against the linked remote:
--   npx supabase db query --linked --yes -f scripts/wipe-training-paths.sql

BEGIN;

DELETE FROM public.notifications
WHERE type IN (
  'lessons_awaiting',
  'lessons_approved',
  'lessons_rejected',
  'discussion_message'
)
OR user_training_id IS NOT NULL;

DELETE FROM public.lesson_discussion_messages;
DELETE FROM public.lesson_submission_files;
DELETE FROM public.lesson_submissions;
DELETE FROM public.user_training_completions;

UPDATE public.users
SET current_user_training_id = NULL
WHERE current_user_training_id IS NOT NULL;

DELETE FROM public.user_trainings;

DELETE FROM public.organization_training_seat_occupancies;
DELETE FROM public.user_training_access_grants;
DELETE FROM public.organization_training_entitlements;
DELETE FROM public.training_path_items;
DELETE FROM public.training_paths;

COMMIT;
