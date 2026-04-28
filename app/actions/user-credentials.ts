"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { revalidatePath } from "next/cache";

export type TrainingCompletion = {
  id: string;
  user_id: string;
  training_name: string;
  completed_on: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CertificationAward = {
  id: string;
  user_id: string;
  certification_name: string;
  awarded_on: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function getTrainingCompletionsForUser(
  userId: string
): Promise<TrainingCompletion[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_training_completions")
    .select("*")
    .eq("user_id", userId)
    .order("completed_on", { ascending: false });

  if (error) {
    console.error("getTrainingCompletionsForUser:", error);
    return [];
  }
  return (data ?? []) as TrainingCompletion[];
}

export async function getCertificationAwardsForUser(
  userId: string
): Promise<CertificationAward[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_certification_awards")
    .select("*")
    .eq("user_id", userId)
    .order("awarded_on", { ascending: false });

  if (error) {
    console.error("getCertificationAwardsForUser:", error);
    return [];
  }
  return (data ?? []) as CertificationAward[];
}

export async function addTrainingCompletion(formData: {
  trainingName: string;
  completedOn: string;
  notes?: string;
}): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase.from("user_training_completions").insert({
    user_id: user.id,
    training_name: formData.trainingName.trim(),
    completed_on: formData.completedOn,
    notes: formData.notes?.trim() || null,
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/credentials");
  return {};
}

export async function deleteTrainingCompletion(id: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("user_training_completions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/credentials");
  return {};
}

export async function addCertificationAward(formData: {
  certificationName: string;
  awardedOn: string;
  notes?: string;
}): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase.from("user_certification_awards").insert({
    user_id: user.id,
    certification_name: formData.certificationName.trim(),
    awarded_on: formData.awardedOn,
    notes: formData.notes?.trim() || null,
  });

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/credentials");
  return {};
}

export async function deleteCertificationAward(id: string): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const { error } = await supabase
    .from("user_certification_awards")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return { error: error.message };
  }
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/credentials");
  return {};
}
