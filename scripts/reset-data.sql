-- Reset data: drop all log records and users for a fresh start.
-- Keeps: schema, acs_code, ata_chapter, curriculum_items, training_plans, etc.
--
-- How to run:
-- 1. Local Supabase: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f scripts/reset-data.sql
--    (Or get the DB URL from: supabase status)
-- 2. Hosted: Supabase Dashboard > SQL Editor > paste this file > Run

BEGIN;

-- 1. Logbook-related (order matters for FKs)
DELETE FROM public.logbook_entry_acs_pending;
DELETE FROM public.logbook_entry_acs;
DELETE FROM public.logbook_entries;

-- 2. ACS signoffs (reference users)
DELETE FROM public.acs_signoff;

-- 3. Notifications
DELETE FROM public.notifications;

-- 4. Weekly submissions
DELETE FROM public.weekly_submission_files;
DELETE FROM public.weekly_submissions;

-- 5. Apprentice progress
DELETE FROM public.apprentice_progress;

-- 5b. Credential history (references users)
DELETE FROM public.user_training_completions;
DELETE FROM public.user_certification_awards;

-- 6. User trainings (enrollments)
DELETE FROM public.user_trainings;

-- 7. Users (references auth.users)
DELETE FROM public.users;

-- 8. Auth users (Supabase Auth)
--    Local: works. Hosted: may need Dashboard > Authentication > Users > delete each,
--    or use service_role connection in SQL Editor.
DELETE FROM auth.users;

COMMIT;
