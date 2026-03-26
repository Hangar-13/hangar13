-- Allow authenticated users to create their own enrollment rows (e.g. purchase / enroll from Find Training).
CREATE POLICY "Users can insert own user_trainings"
  ON public.user_trainings
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
