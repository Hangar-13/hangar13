"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  isValidMechanicCertificateNumber,
  sanitizeMechanicCertificateNumberInput,
} from "@/lib/mechanic-certificate-number";
import { monthInputToDate } from "@/lib/apprenticeship-months";

export type ApprenticeshipBreakInput = {
  startedOn: string;
  endedOn: string | null;
};

export type CertificationStatus = {
  mechanicCertificateNumber: string | null;
  isApprentice: boolean;
  apprenticeshipStartedOn: string | null;
  breaks: ApprenticeshipBreakInput[];
};

function revalidateCertificationSurfaces() {
  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/student/progress");
  revalidatePath("/dashboard/student/certification");
  revalidatePath("/dashboard/student/logbook");
  revalidatePath("/dashboard/mentor/mentees/progress");
}

export async function getCertificationStatus(): Promise<
  CertificationStatus | { error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [{ data: profile, error }, { data: breaks, error: breakError }] = await Promise.all([
    supabase
      .from("users")
      .select("mechanic_certificate_number, is_apprentice, apprenticeship_started_on")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_apprenticeship_breaks")
      .select("started_on, ended_on")
      .eq("user_id", user.id)
      .order("started_on", { ascending: true }),
  ]);

  if (error || breakError || !profile) {
    return { error: "Could not load certification status." };
  }

  return {
    mechanicCertificateNumber:
      (profile.mechanic_certificate_number as string | null)?.trim() || null,
    isApprentice: Boolean(profile.is_apprentice),
    apprenticeshipStartedOn: (profile.apprenticeship_started_on as string | null) ?? null,
    breaks: (breaks ?? []).map((row) => ({
      startedOn: row.started_on as string,
      endedOn: (row.ended_on as string | null) ?? null,
    })),
  };
}

export async function saveMechanicCertificate(
  rawNumber: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const number = sanitizeMechanicCertificateNumberInput(rawNumber);
  if (!isValidMechanicCertificateNumber(number)) {
    return { ok: false, error: "Certificate number must be exactly 7 digits." };
  }

  const { data: taken, error: takenError } = await supabase.rpc(
    "is_mechanic_certificate_number_taken",
    { p_cert_number: number }
  );
  if (takenError) return { ok: false, error: "Could not check that certificate number." };

  const { data: mine } = await supabase
    .from("users")
    .select("mechanic_certificate_number")
    .eq("id", user.id)
    .maybeSingle();
  const own = (mine?.mechanic_certificate_number as string | null)?.trim() ?? "";
  if (taken && own !== number) {
    return { ok: false, error: "That certificate number is already in use." };
  }

  const { error } = await supabase
    .from("users")
    .update({ mechanic_certificate_number: number })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Could not save the certificate number." };

  revalidateCertificationSurfaces();
  return { ok: true };
}

export async function saveApprenticeStatus(input: {
  startedOn: string;
  breaks: ApprenticeshipBreakInput[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const startedOn = monthInputToDate(input.startedOn);
  if (!startedOn) return { ok: false, error: "Enter the month the apprenticeship started." };

  const breaks: { started_on: string; ended_on: string | null }[] = [];
  for (const item of input.breaks) {
    const started = monthInputToDate(item.startedOn);
    if (!started) return { ok: false, error: "Each break needs a start month." };
    const ended = item.endedOn?.trim() ? monthInputToDate(item.endedOn) : null;
    if (item.endedOn?.trim() && !ended) {
      return { ok: false, error: "Each break needs a valid end month." };
    }
    if (ended && ended < started) {
      return { ok: false, error: "A break cannot end before it starts." };
    }
    breaks.push({ started_on: started, ended_on: ended });
  }

  const { error: userError } = await supabase
    .from("users")
    .update({
      is_apprentice: true,
      apprenticeship_started_on: startedOn,
    })
    .eq("id", user.id);
  if (userError) return { ok: false, error: "Could not save apprenticeship status." };

  const { error: deleteError } = await supabase
    .from("user_apprenticeship_breaks")
    .delete()
    .eq("user_id", user.id);
  if (deleteError) return { ok: false, error: "Could not update apprenticeship breaks." };

  if (breaks.length > 0) {
    const { error: insertError } = await supabase.from("user_apprenticeship_breaks").insert(
      breaks.map((row) => ({ ...row, user_id: user.id }))
    );
    if (insertError) return { ok: false, error: "Could not save apprenticeship breaks." };
  }

  revalidateCertificationSurfaces();
  return { ok: true };
}
