/**
 * Mirrors public.certification enum — stored on public.users.current_certification
 * (optional goal, separate from training enrollment in user_trainings).
 */
export type Certification = "FAA_AP" | "FAA_A" | "FAA_P" | "other";

/** FAA goals selectable in the Certification ACS UI (excludes legacy `other`). */
export const CERTIFICATION_GOAL_OPTIONS: {
  value: Exclude<Certification, "other">;
  label: string;
  /** Shown in the certification selection modal under the dropdown. */
  description: string;
}[] = [
  {
    value: "FAA_A",
    label: "FAA Airframe",
    description:
      "Airframe rating only: ACS tracking aligns with the knowledge and skills required for the airframe portion of the A&P certification.",
  },
  {
    value: "FAA_P",
    label: "FAA Powerplant",
    description:
      "Powerplant rating only: ACS tracking aligns with the knowledge and skills required for the powerplant portion of the A&P certification.",
  },
  {
    value: "FAA_AP",
    label: "FAA Airframe & Powerplant",
    description:
      "Full A&P: ACS tracking covers both airframe and powerplant knowledge and skill areas toward the combined mechanic certificate.",
  },
];

export function certificationGoalDescription(
  cert: Exclude<Certification, "other">
): string {
  return CERTIFICATION_GOAL_OPTIONS.find((o) => o.value === cert)?.description ?? "";
}

export function certificationLabel(cert: Certification): string {
  const found = CERTIFICATION_GOAL_OPTIONS.find((o) => o.value === cert);
  if (found) return found.label;
  if (cert === "other") return "Other";
  return cert;
}
