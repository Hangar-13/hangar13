export const EXTERNAL_CERTIFICATION_TYPES = [
  "forklift_operator",
  "factory_school",
  "safety_training",
  "employer_training",
  "professional_license",
  "other",
] as const;

export type ExternalCertificationType =
  (typeof EXTERNAL_CERTIFICATION_TYPES)[number];

export const EXTERNAL_CERTIFICATION_TYPE_LABELS: Record<
  ExternalCertificationType,
  string
> = {
  forklift_operator: "Forklift / equipment operator",
  factory_school: "Factory / OEM school",
  safety_training: "Safety training (OSHA, hazmat, etc.)",
  employer_training: "Employer training program",
  professional_license: "Professional license or credential",
  other: "Other",
};

export type ExternalCertification = {
  id: string;
  user_id: string;
  certification_type: ExternalCertificationType;
  certification_type_other: string | null;
  name: string;
  awarded_on: string;
  expires_on: string | null;
  issuing_organization: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ExternalCertificationDocument = {
  id: string;
  external_certification_id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  file_type: string | null;
  created_at: string;
};

export function externalCertificationTypeLabel(
  type: ExternalCertificationType,
  typeOther: string | null
): string {
  if (type === "other" && typeOther?.trim()) {
    return typeOther.trim();
  }
  return EXTERNAL_CERTIFICATION_TYPE_LABELS[type];
}
