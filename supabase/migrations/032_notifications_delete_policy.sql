-- Allow users to delete their own notifications (when clicked/cleared)
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = recipient_user_id);
