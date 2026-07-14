"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  EXTERNAL_CERTIFICATION_TYPES,
  type ExternalCertification,
  type ExternalCertificationDocument,
  type ExternalCertificationType,
} from "@/lib/external-certification";
import { revalidatePath } from "next/cache";

export type ExternalCertificationFileInput = {
  url: string;
  fileName: string;
  fileSize: number;
  fileType: string;
};

function isExternalCertificationType(
  value: string
): value is ExternalCertificationType {
  return (EXTERNAL_CERTIFICATION_TYPES as readonly string[]).includes(value);
}

export async function createExternalCertification(formData: {
  certificationType: string;
  certificationTypeOther?: string;
  name: string;
  awardedOn: string;
  expiresOn?: string;
  issuingOrganization: string;
  notes?: string;
  document?: ExternalCertificationFileInput;
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  if (!isExternalCertificationType(formData.certificationType)) {
    return { error: "Invalid certification type." };
  }

  const name = formData.name.trim();
  const issuingOrganization = formData.issuingOrganization.trim();
  const certificationTypeOther =
    formData.certificationType === "other"
      ? formData.certificationTypeOther?.trim() || null
      : null;

  if (!name) {
    return { error: "Certificate name is required." };
  }
  if (!issuingOrganization) {
    return { error: "Issuing organization is required." };
  }
  if (formData.certificationType === "other" && !certificationTypeOther) {
    return { error: "Please describe the certification type." };
  }
  if (!formData.awardedOn) {
    return { error: "Award date is required." };
  }

  const expiresOn = formData.expiresOn?.trim() || null;
  if (expiresOn && expiresOn < formData.awardedOn) {
    return { error: "Expiration date must be on or after the award date." };
  }

  const { data: certification, error: insertError } = await supabase
    .from("user_external_certifications")
    .insert({
      user_id: user.id,
      certification_type: formData.certificationType,
      certification_type_other: certificationTypeOther,
      name,
      awarded_on: formData.awardedOn,
      expires_on: expiresOn,
      issuing_organization: issuingOrganization,
      notes: formData.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (insertError || !certification) {
    return { error: insertError?.message ?? "Failed to save certification." };
  }

  if (formData.document) {
    const { error: documentError } = await supabase
      .from("user_external_certification_documents")
      .insert({
        external_certification_id: certification.id,
        file_url: formData.document.url,
        file_name: formData.document.fileName,
        file_size: formData.document.fileSize,
        file_type: formData.document.fileType || null,
      });

    if (documentError) {
      await supabase
        .from("user_external_certifications")
        .delete()
        .eq("id", certification.id)
        .eq("user_id", user.id);
      return { error: documentError.message };
    }
  }

  revalidatePath("/dashboard/student/external-certifications");
  revalidatePath("/dashboard/student/certification");

  return { id: certification.id };
}

export async function getExternalCertificationsForUser(
  userId: string
): Promise<
  Array<
    ExternalCertification & {
      document: ExternalCertificationDocument | null;
    }
  >
> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_external_certifications")
    .select(
      `
      *,
      user_external_certification_documents (*)
    `
    )
    .eq("user_id", userId)
    .order("awarded_on", { ascending: false });

  if (error) {
    console.error("getExternalCertificationsForUser:", error);
    return [];
  }

  return (data ?? []).map((row) => {
    const documents = row.user_external_certification_documents as
      | ExternalCertificationDocument[]
      | ExternalCertificationDocument
      | null;

    const document = Array.isArray(documents)
      ? documents[0] ?? null
      : documents;

    const { user_external_certification_documents: _docs, ...certification } =
      row;

    return {
      ...(certification as ExternalCertification),
      document,
    };
  });
}
