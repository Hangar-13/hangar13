-- Trigger to create profile and apprentice record when a new user signs up.
-- The handle_new_user() function already exists; it was never wired to auth.users.
-- See: https://supabase.com/docs/guides/auth/managing-user-data

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
