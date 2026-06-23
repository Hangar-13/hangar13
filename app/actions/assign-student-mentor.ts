"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

/**
 * Assign the calling mentor as a student's mentor at the profile level
 * (public.users.mentor_id), independent of any training-path enrollment.
 */
export async function assignStudentMentorAction(input: {
  studentUserId: string;
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

  const { data, error } = await supabase.rpc("assign_student_mentor", {
    p_student_id: input.studentUserId,
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

/**
 * Remove the calling mentor from a student (clears public.users.mentor_id).
 * Used by mentors to unassign themselves from their own students.
 */
export async function unassignStudentMentorAction(input: {
  studentUserId: string;
}): Promise<{ success?: true; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data, error } = await supabase.rpc("assign_student_mentor", {
    p_student_id: input.studentUserId,
    p_mentor_id: null,
  });

  if (error) {
    return { error: error.message || "Could not remove mentor." };
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
