export const MECHANIC_CERTIFICATE_TYPES = ["A", "P", "A&P", "AME"] as const;

export type MechanicCertificateType = (typeof MECHANIC_CERTIFICATE_TYPES)[number];

export const MECHANIC_CERTIFICATE_TYPE_LABELS: Record<MechanicCertificateType, string> = {
  A: "Airframe (A)",
  P: "Powerplant (P)",
  "A&P": "A&P",
  AME: "AME",
};

export function isMechanicCertificateType(value: string): value is MechanicCertificateType {
  return (MECHANIC_CERTIFICATE_TYPES as readonly string[]).includes(value);
}

/** A full A&P is not also an apprentice. A and P ratings can be. */
export function certificateAllowsApprentice(type: MechanicCertificateType | null): boolean {
  return type !== "A&P";
}
