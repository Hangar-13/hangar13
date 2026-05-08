"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

export type LogbookMentorContext = {
  hasAssignedMentor: boolean;
  mentor: {
    id: string;
    full_name: string | null;
    mechanic_certificate_type: string | null;
    mechanic_certificate_number: string | null;
    visible: boolean;
  } | null;
};

export async function getLogbookMentorContext(): Promise<
  LogbookMentorContext | { error: string }
> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase.rpc("get_logbook_mentor_display_context");
  if (error) {
    return { error: error.message };
  }

  const payload = data as {
    error?: string;
    hasAssignedMentor?: boolean;
    mentor?: {
      id: string;
      full_name: string | null;
      mechanic_certificate_type: string | null;
      mechanic_certificate_number: string | null;
      visible: boolean;
    } | null;
  } | null;

  if (!payload) {
    return { error: "Could not load mentor information." };
  }
  if (typeof payload.error === "string") {
    return { error: payload.error };
  }
  if (!payload.hasAssignedMentor || !payload.mentor) {
    return { hasAssignedMentor: false, mentor: null };
  }

  const m = payload.mentor;
  return {
    hasAssignedMentor: true,
    mentor: {
      id: m.id,
      full_name: m.full_name,
      mechanic_certificate_type: m.mechanic_certificate_type,
      mechanic_certificate_number: m.mechanic_certificate_number,
      visible: m.visible,
    },
  };
}

export type MechanicMentorSearchRow = {
  id: string;
  full_name: string | null;
  mechanic_certificate_type: string | null;
  mechanic_certificate_number: string | null;
  visible: boolean;
};

export async function searchMechanicMentorsForLogbook(
  query: string
): Promise<{ rows: MechanicMentorSearchRow[] } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  const q = query.trim();
  if (q.length < 2) {
    return { rows: [] };
  }

  const { data, error } = await supabase.rpc("search_mechanic_mentors", {
    p_query: q,
    p_limit: 20,
  });

  if (error) {
    return { error: error.message };
  }

  return { rows: (data ?? []) as MechanicMentorSearchRow[] };
}

export async function isMechanicCertificateNumberTakenAction(
  certNumber: string
): Promise<{ taken: boolean } | { error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated." };
  }

  const { data, error } = await supabase.rpc("is_mechanic_certificate_number_taken", {
    p_cert_number: certNumber.trim(),
  });

  if (error) {
    return { error: error.message };
  }

  return { taken: Boolean(data) };
}

export async function clearInvisibleAssignedMentorAction(): Promise<
  { success?: true } | { error: string }
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("clear_invisible_assigned_mentor_for_self");

  if (error) {
    return { error: error.message };
  }
  const res = data as { error?: string; success?: boolean } | null;
  if (res?.error) {
    return { error: res.error };
  }
  return { success: true };
}

export async function assignSelfMentorAction(
  mentorUserId: string
): Promise<{ success?: true; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("assign_self_mentor", {
    p_mentor_id: mentorUserId,
  });

  if (error) {
    return { error: error.message };
  }
  const res = data as { error?: string; success?: boolean };
  if (res?.error) {
    return { error: res.error };
  }
  return { success: true };
}

export async function createInvisibleMechanicMentorAndAssignAction(input: {
  firstName: string;
  lastName: string;
  mechanicCertType: "A" | "P" | "A&P" | "AME";
  mechanicCertNumber: string;
}): Promise<{ mentorUserId?: string; error?: string }> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("claim_external_mentor_for_self", {
    p_first_name: input.firstName.trim(),
    p_last_name: input.lastName.trim(),
    p_mechanic_cert_type: input.mechanicCertType,
    p_mechanic_cert_number: input.mechanicCertNumber.trim(),
  });

  if (error) {
    return { error: error.message };
  }
  if (!data || typeof data !== "string") {
    return { error: "Could not create mentor." };
  }
  return { mentorUserId: data };
}
