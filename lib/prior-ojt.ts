import type { AcsDomain } from "@/lib/acs-utils";
import { getDomainForAtaChapter } from "@/lib/acs-utils";
import type { AcsCategory, AcsCodeWithChapters } from "@/app/actions/acs-codes";
import type { AtaChapter } from "@/app/actions/ata-chapters";
import { sortByAcsCode } from "@/lib/acs-code-sort";

export const PRIOR_OJT_BACKGROUNDS = [
  "pilot_flight",
  "military_mos",
  "ga_maintenance",
  "part_147",
  "other",
] as const;

export type PriorOjtBackground = (typeof PRIOR_OJT_BACKGROUNDS)[number];

export const PRIOR_OJT_BACKGROUND_LABELS: Record<PriorOjtBackground, string> = {
  pilot_flight: "Pilot / flight experience",
  military_mos: "Military / MOS",
  ga_maintenance: "GA maintenance experience",
  part_147: "Part 147 school",
  other: "Other",
};

export const PRIOR_OJT_EVIDENCE_TYPES = [
  "logbook",
  "mos_military",
  "experience",
  "training_cert",
  "other",
] as const;

export type PriorOjtEvidenceType = (typeof PRIOR_OJT_EVIDENCE_TYPES)[number];

export const PRIOR_OJT_EVIDENCE_LABELS: Record<PriorOjtEvidenceType, string> = {
  logbook: "Logbook",
  mos_military: "MOS / Military",
  experience: "Experience",
  training_cert: "Training cert",
  other: "Other",
};

export type PriorOjtAssessmentStatus =
  | "in_progress"
  | "completed"
  | "reviewing"
  | "accepted";

export type PriorOjtProposedEntryStatus = "pending" | "removed" | "accepted";

export type PriorOjtSectionMeta = {
  domain: AcsDomain;
  roman: string;
  shortLabel: string;
  title: string;
  blurb: string;
  badgeClass: string;
  accentClass: string;
};

export const PRIOR_OJT_SECTIONS: PriorOjtSectionMeta[] = [
  {
    domain: "general",
    roman: "I",
    shortLabel: "General",
    title: "Section I: General",
    blurb:
      "Electricity, drawings, weight & balance, fluid lines, hardware, ground ops, corrosion, math, regulations, physics, inspection, human factors",
    badgeClass: "bg-sky-100 text-sky-800",
    accentClass: "text-sky-700",
  },
  {
    domain: "airframe",
    roman: "II",
    shortLabel: "Airframe",
    title: "Section II: Airframe",
    blurb:
      "Structures, flight controls, landing gear, hydraulics, instruments, avionics, fuel systems, electrical, fire protection, rotorcraft",
    badgeClass: "bg-emerald-100 text-emerald-800",
    accentClass: "text-emerald-700",
  },
  {
    domain: "powerplant",
    roman: "III",
    shortLabel: "Powerplant",
    title: "Section III: Powerplant",
    blurb:
      "Reciprocating and turbine engines, fuel systems, ignition, lubrication, inspection, fire protection, propellers",
    badgeClass: "bg-amber-100 text-amber-900",
    accentClass: "text-amber-800",
  },
];

export function sectionMetaForDomain(domain: AcsDomain): PriorOjtSectionMeta {
  return (
    PRIOR_OJT_SECTIONS.find((s) => s.domain === domain) ?? PRIOR_OJT_SECTIONS[0]
  );
}

/** One wizard step = one ATA chapter with ACS codes linked via acs_code.ata_chapters. */
export type PriorOjtChapterStep = {
  key: string;
  chapterNumber: string;
  title: string;
  description: string | null;
  /** Primary section badge domain for this chapter. */
  domain: AcsDomain;
  codes: AcsCodeWithChapters[];
};

export function chapterStepKey(chapterNumber: string): string {
  return `ata:${chapterNumber}`;
}

/**
 * Build Prior OJT steps from ATA chapters, using the same ACS↔ATA mapping as
 * logbook entry creation (acs_code.ata_chapter_numbers / getAcsCodesByChapter).
 */
export function buildPriorOjtChapterSteps(
  codes: AcsCodeWithChapters[],
  ataChapters: AtaChapter[],
  domains?: AcsDomain[]
): PriorOjtChapterStep[] {
  const domainFilter = domains?.length ? new Set(domains) : null;

  const chapterNumbers = new Set<string>();
  for (const code of codes) {
    if (domainFilter && !domainFilter.has(code.domain)) continue;
    for (const n of code.ata_chapter_numbers) {
      if (n) chapterNumbers.add(n);
    }
  }

  const steps: PriorOjtChapterStep[] = [];
  for (const chapter of ataChapters) {
    if (!chapterNumbers.has(chapter.chapter_number)) continue;

    // Same mapping as logbook: every ACS code linked to this ATA chapter.
    let chapterCodes = codes.filter((c) =>
      c.ata_chapter_numbers.includes(chapter.chapter_number)
    );
    if (domainFilter) {
      chapterCodes = chapterCodes.filter((c) => domainFilter.has(c.domain));
    }
    if (chapterCodes.length === 0) continue;

    const domainCounts: Record<AcsDomain, number> = {
      general: 0,
      airframe: 0,
      powerplant: 0,
    };
    for (const c of chapterCodes) domainCounts[c.domain] += 1;
    const domain =
      (["general", "airframe", "powerplant"] as AcsDomain[]).sort(
        (a, b) => domainCounts[b] - domainCounts[a]
      )[0] ?? getDomainForAtaChapter(chapter.chapter_number);

    steps.push({
      key: chapterStepKey(chapter.chapter_number),
      chapterNumber: chapter.chapter_number,
      title: chapter.title,
      description: chapter.description,
      domain,
      codes: sortByAcsCode(chapterCodes),
    });
  }

  return steps;
}

export const ACS_CATEGORY_LABELS: Record<AcsCategory, string> = {
  knowledge: "Knowledge",
  risk_management: "Risk management",
  skill: "Skill",
};

export const ACS_CATEGORY_ORDER: AcsCategory[] = [
  "knowledge",
  "risk_management",
  "skill",
];

export type PriorOjtClaimInput = {
  acsCodeId: number;
  evidenceTypes: PriorOjtEvidenceType[];
};

export type PriorOjtClaimState = Record<
  number,
  { selected: boolean; evidenceTypes: PriorOjtEvidenceType[] }
>;

export type GeneratedProposedEntry = {
  entryDate: string;
  hoursWorked: number;
  description: string;
  ataChapterNumber: string | null;
  acsCodeIds: number[];
  domain: AcsDomain;
  subjectLetter: string;
  subject: string;
  evidenceTypes: PriorOjtEvidenceType[];
  sortOrder: number;
};

/** One proposed log entry per ATA chapter that has claimed ACS codes. */
export function generateProposedEntriesFromClaims(args: {
  claims: PriorOjtClaimInput[];
  codesById: Map<number, AcsCodeWithChapters>;
  /** Preferred ATA chapter for each claimed ACS code (from the wizard step). */
  claimChapters?: Record<number, string>;
  ataChapterTitles?: Map<string, string>;
  entryDate?: string;
}): GeneratedProposedEntry[] {
  const byChapter = new Map<
    string,
    {
      chapterNumber: string;
      domain: AcsDomain;
      codeIds: number[];
      evidence: Set<PriorOjtEvidenceType>;
    }
  >();

  for (const claim of args.claims) {
    const code = args.codesById.get(claim.acsCodeId);
    if (!code || claim.evidenceTypes.length === 0) continue;

    const preferred = args.claimChapters?.[claim.acsCodeId];
    const chapterNumber =
      (preferred && code.ata_chapter_numbers.includes(preferred)
        ? preferred
        : null) ??
      code.ata_chapter_numbers[0] ??
      null;
    if (!chapterNumber) continue;

    let bucket = byChapter.get(chapterNumber);
    if (!bucket) {
      bucket = {
        chapterNumber,
        domain: code.domain,
        codeIds: [],
        evidence: new Set(),
      };
      byChapter.set(chapterNumber, bucket);
    }
    if (!bucket.codeIds.includes(code.id)) {
      bucket.codeIds.push(code.id);
    }
    for (const e of claim.evidenceTypes) bucket.evidence.add(e);
  }

  const today = args.entryDate ?? new Date().toISOString().slice(0, 10);

  const rows = [...byChapter.values()].sort((a, b) =>
    a.chapterNumber.localeCompare(b.chapterNumber, undefined, { numeric: true })
  );

  return rows.map((row, index) => {
    const title =
      args.ataChapterTitles?.get(row.chapterNumber) ?? `ATA ${row.chapterNumber}`;
    const evidenceList = [...row.evidence]
      .map((e) => PRIOR_OJT_EVIDENCE_LABELS[e])
      .join(", ");
    const hoursWorked = Math.max(1, Number((row.codeIds.length * 0.5).toFixed(2)));

    return {
      entryDate: today,
      hoursWorked,
      description: [
        `Prior OJT experience — ATA ${row.chapterNumber} ${title}`,
        `Claimed ${row.codeIds.length} ACS code${row.codeIds.length === 1 ? "" : "s"}.`,
        evidenceList ? `Evidence: ${evidenceList}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      ataChapterNumber: row.chapterNumber,
      acsCodeIds: row.codeIds,
      domain: row.domain,
      subjectLetter: "",
      subject: `ATA ${row.chapterNumber} — ${title}`,
      evidenceTypes: [...row.evidence],
      sortOrder: index,
    };
  });
}

export function countClaimsByDomain(
  claims: PriorOjtClaimInput[],
  codesById: Map<number, AcsCodeWithChapters>
): Record<AcsDomain, number> {
  const counts: Record<AcsDomain, number> = {
    general: 0,
    airframe: 0,
    powerplant: 0,
  };
  for (const claim of claims) {
    const code = codesById.get(claim.acsCodeId);
    if (code) counts[code.domain] += 1;
  }
  return counts;
}
