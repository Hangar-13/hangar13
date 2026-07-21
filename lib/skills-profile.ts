import type { Certification } from "@/lib/certification";
import type { CertificationAward } from "@/app/actions/user-credentials";
import type { ExternalCertificationDocument } from "@/lib/external-certification";
import type { ExternalCertificationType } from "@/lib/external-certification";
import type { UserTrainingEnrollmentRow } from "@/lib/my-trainings-display";
import { parseLogbookAdditionalInformation } from "@/lib/logbook-additional-information";
import {
  extractAtaChapterNumbers,
  type LogbookExportEntry,
} from "@/lib/logbook-export";

export type SkillsProfileLogbookEntry = LogbookExportEntry;

export type SkillsProfileUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  mechanic_certificate_type: string | null;
  mechanic_certificate_number: string | null;
  current_certification: Certification | null;
  hasActiveEnrollment: boolean;
};

export type SkillsProfileCertificationAward = CertificationAward;

export type SkillsProfileExternalCertification = {
  id: string;
  certification_type: ExternalCertificationType;
  certification_type_other: string | null;
  name: string;
  awarded_on: string;
  expires_on: string | null;
  issuing_organization: string;
  notes: string | null;
  document: ExternalCertificationDocument | null;
};

export type SkillsProfileTrainingCompletion = {
  id: string;
  training_name: string;
  completed_on: string;
  notes: string | null;
  source: "manual" | "platform";
};

export type SkillsProfileExperienceRow = {
  key: string;
  label: string;
  totalHours: number;
  entryCount: number;
  entries: SkillsProfileLogbookEntry[];
};

export type SkillsProfileData = {
  user: SkillsProfileUser;
  viewerIsOwner: boolean;
  totalOjtHours: number;
  certificationAwards: SkillsProfileCertificationAward[];
  externalCertifications: SkillsProfileExternalCertification[];
  trainingCompletions: SkillsProfileTrainingCompletion[];
  platformTrainings: UserTrainingEnrollmentRow[];
  aircraftExperience: SkillsProfileExperienceRow[];
  engineExperience: SkillsProfileExperienceRow[];
  propellerExperience: SkillsProfileExperienceRow[];
  ataExperience: SkillsProfileExperienceRow[];
  logbookEntries: SkillsProfileLogbookEntry[];
};

const UNSPECIFIED_AIRCRAFT = "(unspecified aircraft)";

export type SkillsProfileEquipmentKind = "aircraft" | "engine" | "propeller" | "ata";

function padChapter(ch: string): string {
  return ch.length === 1 && /^\d$/.test(ch) ? `0${ch}` : ch;
}

function entryMatchesAircraft(
  entry: SkillsProfileLogbookEntry,
  aircraftKey: string
): boolean {
  const label = entry.aircraft?.trim() || UNSPECIFIED_AIRCRAFT;
  return label === aircraftKey;
}

function entryEquipmentValue(
  entry: SkillsProfileLogbookEntry,
  kind: "engine" | "propeller"
): string {
  const info = parseLogbookAdditionalInformation(entry.additional_information);
  return (kind === "engine" ? info.engine : info.propeller)?.trim() ?? "";
}

function entryMatchesEquipment(
  entry: SkillsProfileLogbookEntry,
  kind: "engine" | "propeller",
  equipmentKey: string
): boolean {
  return entryEquipmentValue(entry, kind) === equipmentKey;
}

function entryMatchesAtaChapter(
  entry: SkillsProfileLogbookEntry,
  chapterKey: string
): boolean {
  const chapters = extractAtaChapterNumbers(entry).map(padChapter);
  if (chapterKey === "__unassigned__") {
    return chapters.length === 0;
  }
  return chapters.includes(chapterKey);
}

function rowsFromBuckets(
  byKey: Map<
    string,
    { totalHours: number; entryCount: number; entries: SkillsProfileLogbookEntry[] }
  >
): SkillsProfileExperienceRow[] {
  return [...byKey.entries()]
    .map(([key, value]) => ({
      key,
      label: key,
      totalHours: value.totalHours,
      entryCount: value.entryCount,
      entries: value.entries.sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
    }))
    .sort((a, b) => b.totalHours - a.totalHours || a.label.localeCompare(b.label));
}

export function aggregateAircraftExperience(
  entries: SkillsProfileLogbookEntry[]
): SkillsProfileExperienceRow[] {
  const byKey = new Map<
    string,
    { totalHours: number; entryCount: number; entries: SkillsProfileLogbookEntry[] }
  >();

  for (const entry of entries) {
    const key = entry.aircraft?.trim() || UNSPECIFIED_AIRCRAFT;
    const hours = Number(entry.hours_worked) || 0;
    const bucket = byKey.get(key) ?? {
      totalHours: 0,
      entryCount: 0,
      entries: [],
    };
    bucket.totalHours += hours;
    bucket.entryCount += 1;
    bucket.entries.push(entry);
    byKey.set(key, bucket);
  }

  return rowsFromBuckets(byKey);
}

function aggregateEquipmentExperience(
  entries: SkillsProfileLogbookEntry[],
  kind: "engine" | "propeller"
): SkillsProfileExperienceRow[] {
  const byKey = new Map<
    string,
    { totalHours: number; entryCount: number; entries: SkillsProfileLogbookEntry[] }
  >();

  for (const entry of entries) {
    const key = entryEquipmentValue(entry, kind);
    if (!key) continue;
    const hours = Number(entry.hours_worked) || 0;
    const bucket = byKey.get(key) ?? {
      totalHours: 0,
      entryCount: 0,
      entries: [],
    };
    bucket.totalHours += hours;
    bucket.entryCount += 1;
    bucket.entries.push(entry);
    byKey.set(key, bucket);
  }

  return rowsFromBuckets(byKey);
}

export function aggregateEngineExperience(
  entries: SkillsProfileLogbookEntry[]
): SkillsProfileExperienceRow[] {
  return aggregateEquipmentExperience(entries, "engine");
}

export function aggregatePropellerExperience(
  entries: SkillsProfileLogbookEntry[]
): SkillsProfileExperienceRow[] {
  return aggregateEquipmentExperience(entries, "propeller");
}

export function aggregateAtaExperience(
  entries: SkillsProfileLogbookEntry[],
  ataChapters: Array<{ chapter_number: string; title: string }>
): SkillsProfileExperienceRow[] {
  const titleByChapter = new Map(
    ataChapters.map((c) => [padChapter(c.chapter_number), c.title])
  );
  const byKey = new Map<
    string,
    { totalHours: number; entryCount: number; entries: SkillsProfileLogbookEntry[] }
  >();

  for (const entry of entries) {
    const chapters = extractAtaChapterNumbers(entry).map(padChapter);
    const keys = chapters.length > 0 ? chapters : ["__unassigned__"];
    const hours = Number(entry.hours_worked) || 0;

    for (const key of keys) {
      const bucket = byKey.get(key) ?? {
        totalHours: 0,
        entryCount: 0,
        entries: [],
      };
      bucket.totalHours += hours;
      bucket.entryCount += 1;
      bucket.entries.push(entry);
      byKey.set(key, bucket);
    }
  }

  const orderedKeys: string[] = [];
  for (const { chapter_number } of ataChapters) {
    const key = padChapter(chapter_number);
    if (byKey.has(key)) orderedKeys.push(key);
  }
  for (const key of byKey.keys()) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }

  return orderedKeys.map((key) => {
    const value = byKey.get(key)!;
    const title = key === "__unassigned__" ? "Unassigned" : titleByChapter.get(key) ?? "";
    const label =
      key === "__unassigned__"
        ? "Unassigned"
        : title
          ? `ATA ${key} — ${title}`
          : `ATA ${key}`;

    return {
      key,
      label,
      totalHours: value.totalHours,
      entryCount: value.entryCount,
      entries: value.entries.sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
    };
  });
}

export function filterExperienceEntries(
  row: SkillsProfileExperienceRow,
  kind: SkillsProfileEquipmentKind
): SkillsProfileLogbookEntry[] {
  if (kind === "aircraft") {
    return row.entries.filter((entry) => entryMatchesAircraft(entry, row.key));
  }
  if (kind === "engine" || kind === "propeller") {
    return row.entries.filter((entry) => entryMatchesEquipment(entry, kind, row.key));
  }
  return row.entries.filter((entry) => entryMatchesAtaChapter(entry, row.key));
}

export function formatSkillsHours(hours: number): string {
  if (Number.isInteger(hours)) return String(hours);
  return hours.toFixed(1);
}
