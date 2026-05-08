"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export async function assignEnrollmentMentorAction(input: {
  userTrainingId: string;
  mentorUserId: string;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." };
  }
  if (user.id !== input.mentorUserId) {
    return { error: "Unauthorized." };
  }

  const { data, error } = await supabase.rpc("assign_enrollment_mentor", {
    p_user_training_id: input.userTrainingId,
    p_mentor_id: input.mentorUserId,
  });

  if (error) {
    return { error: error.message || "Could not assign mentor." };
  }

  const result = data as { error?: string; success?: boolean };
  if (result?.error) {
    return { error: result.error };
  }

  revalidatePath("/dashboard/mentor");
  revalidatePath("/dashboard/mentor/mentees");
  revalidatePath("/dashboard/mentor/review-logs");

  return { success: true };
}
