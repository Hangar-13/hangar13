import type { Certification } from "@/lib/certification";
import { certificationLabel } from "@/lib/certification";

export type SkillsProfileCredentialStatus = {
  /** Human-readable lines shown under the user's name. */
  lines: string[];
};

const MECHANIC_CERT_LABELS: Record<string, string> = {
  "A&P": "FAA Airframe & Powerplant (A&P)",
  A: "FAA Airframe (A)",
  P: "FAA Powerplant (P)",
  AME: "FAA Aviation Maintenance Engineer (AME)",
};

function mechanicCertificateLabel(type: string): string {
  return MECHANIC_CERT_LABELS[type] ?? `FAA mechanic (${type})`;
}

function hasIssuedMechanicCertificate(
  type: string | null | undefined,
  number: string | null | undefined
): boolean {
  const t = type?.trim();
  if (!t) return false;
  if (t === "A" || t === "P" || t === "A&P" || t === "AME") {
    return Boolean(number?.trim());
  }
  return false;
}

export function buildSkillsProfileCredentialStatus(input: {
  mechanic_certificate_type: string | null;
  mechanic_certificate_number: string | null;
  current_certification: Certification | null;
  hasActiveEnrollment: boolean;
}): SkillsProfileCredentialStatus {
  const lines: string[] = [];
  const certType = input.mechanic_certificate_type?.trim() ?? null;
  const certNumber = input.mechanic_certificate_number?.trim() ?? null;

  if (certType && hasIssuedMechanicCertificate(certType, certNumber)) {
    const label = mechanicCertificateLabel(certType);
    lines.push(certNumber ? `${label} · #${certNumber}` : label);
    return { lines };
  }

  if (input.hasActiveEnrollment || input.current_certification) {
    lines.push("Apprentice");
    if (input.current_certification && input.current_certification !== "other") {
      lines.push(`Working toward ${certificationLabel(input.current_certification)}`);
    }
  }

  return { lines };
}
