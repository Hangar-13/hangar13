-- Remove legacy log_entry schema. The app uses logbook_entries and logbook_entry_acs_pending exclusively.
-- These tables (log_entry, app_user, etc.) were never integrated and are unused.

-- Drop in dependency order (children first)
DROP TABLE IF EXISTS public.log_entry_acs_pending CASCADE;
DROP TABLE IF EXISTS public.log_entry_acs CASCADE;
DROP TABLE IF EXISTS public.log_entry_signoff CASCADE;
DROP TABLE IF EXISTS public.acs_signoff CASCADE;
DROP TABLE IF EXISTS public.log_entry CASCADE;
DROP TABLE IF EXISTS public.certification CASCADE;
DROP TABLE IF EXISTS public.user_organization_role CASCADE;
DROP TABLE IF EXISTS public.organization CASCADE;
DROP TABLE IF EXISTS public.aircraft CASCADE;
DROP TABLE IF EXISTS public.app_user CASCADE;
