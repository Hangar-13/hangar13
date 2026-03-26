import type { AcsDomain } from "@/lib/acs-utils";
import type { Certification } from "@/lib/certification";

/** Maps FAA certification goal to ACS domains (Section I = general, II = airframe, III = powerplant). */
export function domainsForCertification(certification: Certification | null): AcsDomain[] {
  if (!certification || certification === "other") {
    return ["general", "airframe", "powerplant"];
  }
  switch (certification) {
    case "FAA_AP":
      return ["general", "airframe", "powerplant"];
    case "FAA_A":
      return ["general", "airframe"];
    case "FAA_P":
      return ["general", "powerplant"];
    default:
      return ["general", "airframe", "powerplant"];
  }
}

/** Number of ACS codes the apprentice must complete in a section (75% of codes in that section). */
export function requiredCodesForDomain(totalCodesInDomain: number): number {
  if (totalCodesInDomain <= 0) return 0;
  return Math.ceil(totalCodesInDomain * 0.75);
}

export const DOMAIN_SECTION_LABEL: Record<
  AcsDomain,
  { title: string }
> = {
  general: { title: "Section I — General" },
  airframe: { title: "Section II — Airframe" },
  powerplant: { title: "Section III — Powerplant" },
};

export type DomainProgressStat = {
  domain: AcsDomain;
  sectionTitle: string;
  signed: number;
  /** Target sign-offs (75% of codes in this section). */
  required: number;
  totalCodesInDomain: number;
  percentage: number;
};

export type AcsCertificationProgressStats = {
  overall: {
    signed: number;
    required: number;
    percentage: number;
  };
  domains: DomainProgressStat[];
};

export function computeAcsCertificationProgressStats(
  totalByDomain: Record<AcsDomain, number>,
  acsIdToDomain: Map<number, AcsDomain>,
  signedAcsIds: Iterable<number>,
  certification: Certification | null
): AcsCertificationProgressStats {
  const applicable = domainsForCertification(certification);
  const signedSet = new Set(signedAcsIds);

  const domains: DomainProgressStat[] = [];
  let overallSigned = 0;
  let overallRequired = 0;

  for (const d of applicable) {
    const totalCodesInDomain = totalByDomain[d] ?? 0;
    const required = requiredCodesForDomain(totalCodesInDomain);
    let signed = 0;
    for (const id of signedSet) {
      if (acsIdToDomain.get(id) === d) {
        signed++;
      }
    }
    const percentage =
      required > 0 ? Math.min(100, Math.round((signed / required) * 100)) : 0;

    domains.push({
      domain: d,
      sectionTitle: DOMAIN_SECTION_LABEL[d].title,
      signed,
      required,
      totalCodesInDomain,
      percentage,
    });
    overallSigned += signed;
    overallRequired += required;
  }

  const overallPercentage =
    overallRequired > 0
      ? Math.min(100, Math.round((overallSigned / overallRequired) * 100))
      : 0;

  return {
    overall: {
      signed: overallSigned,
      required: overallRequired,
      percentage: overallPercentage,
    },
    domains,
  };
}
