"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  isValidMechanicCertificateNumber,
  sanitizeMechanicCertificateNumberInput,
} from "@/lib/mechanic-certificate-number";
import {
  certificateAllowsApprentice,
  isMechanicCertificateType,
  type MechanicCertificateType,
} from "@/lib/mechanic-certificate-type";
import { monthInputToDate } from "@/lib/apprenticeship-months";

export type CertificationStatus = {
  mechanicCertificateType: MechanicCertificateType | null;
  mechanicCertificateNumber: string | null;
  isApprentice: boolean;
  apprenticeshipStartedOn: string | null;
  declared: boolean;
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

  const { data: profile, error } = await supabase
    .from("users")
    .select(
      "mechanic_certificate_type, mechanic_certificate_number, is_apprentice, apprenticeship_started_on, certification_declared_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    return { error: "Could not load certification status." };
  }

  const rawType = (profile.mechanic_certificate_type as string | null)?.trim() ?? "";
  const certificateType = isMechanicCertificateType(rawType) ? rawType : null;

  return {
    mechanicCertificateType: certificateType,
    mechanicCertificateNumber:
      (profile.mechanic_certificate_number as string | null)?.trim() || null,
    isApprentice: Boolean(profile.is_apprentice),
    apprenticeshipStartedOn: (profile.apprenticeship_started_on as string | null) ?? null,
    declared: profile.certification_declared_at != null,
  };
}

export async function saveCertificationStatus(input: {
  certificateType: MechanicCertificateType | null;
  certificateNumber: string;
  isApprentice: boolean;
  startedOn: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const certificateType = input.certificateType;
  let certificateNumber: string | null = null;
  if (certificateType) {
    certificateNumber = sanitizeMechanicCertificateNumberInput(input.certificateNumber);
    if (!isValidMechanicCertificateNumber(certificateNumber)) {
      return { ok: false, error: "Certificate number must be exactly 7 digits." };
    }
    const { data: taken, error: takenError } = await supabase.rpc(
      "is_mechanic_certificate_number_taken",
      { p_cert_number: certificateNumber }
    );
    if (takenError) return { ok: false, error: "Could not check that certificate number." };
    const { data: mine } = await supabase
      .from("users")
      .select("mechanic_certificate_number")
      .eq("id", user.id)
      .maybeSingle();
    const own = (mine?.mechanic_certificate_number as string | null)?.trim() ?? "";
    if (taken && own !== certificateNumber) {
      return { ok: false, error: "That certificate number is already in use." };
    }
  }

  const allowsApprentice = certificateAllowsApprentice(certificateType);
  const isApprentice = allowsApprentice && input.isApprentice;
  let startedOn: string | null = null;
  if (isApprentice) {
    startedOn = monthInputToDate(input.startedOn ?? "");
    if (!startedOn) return { ok: false, error: "Enter the month your apprenticeship started." };
  }

  const { error } = await supabase
    .from("users")
    .update({
      mechanic_certificate_type: certificateType,
      mechanic_certificate_number: certificateNumber,
      is_apprentice: isApprentice,
      apprenticeship_started_on: startedOn,
      certification_declared_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "Could not save certification status." };

  revalidateCertificationSurfaces();
  return { ok: true };
}
