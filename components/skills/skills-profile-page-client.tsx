"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SkillsProfileData, SkillsProfileExperienceRow } from "@/lib/skills-profile";
import { filterExperienceEntries, formatSkillsHours } from "@/lib/skills-profile";
import { externalCertificationTypeLabel } from "@/lib/external-certification";
import { formatUiDate } from "@/lib/format-ui-date";
import { getUserInitials } from "@/lib/user-initials";
import { extractAtaChapterLabels } from "@/lib/logbook-export";
import { parseLogbookAdditionalInformation } from "@/lib/logbook-additional-information";
import { downloadSkillsProfilePdf } from "@/lib/skills-profile-export";
import { buildSkillsProfileCredentialStatus } from "@/lib/skills-profile-credential-status";
import { DashboardContentFrame } from "@/components/dashboard/page-shell";
import { CollapsibleSection } from "@/components/student/collapsible-section";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Award,
  BookOpen,
  ChevronRight,
  Cog,
  FileDown,
  Plane,
  Plus,
  Wrench,
} from "lucide-react";

const titleClass =
  "text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground";

const profileCardClass =
  "rounded-md bg-background px-5 py-5 shadow-sm ring-1 ring-black/[0.04]";

type DetailPanel =
  | { kind: "certifications" }
  | { kind: "trainings" }
  | { kind: "aircraft"; row: SkillsProfileExperienceRow }
  | { kind: "engine"; row: SkillsProfileExperienceRow }
  | { kind: "propeller"; row: SkillsProfileExperienceRow }
  | { kind: "ata"; row: SkillsProfileExperienceRow }
  | { kind: "external-cert"; certId: string }
  | null;

type Props = {
  profile: SkillsProfileData;
  backHref?: string;
  backLabel?: string;
};

function ProfileAvatar({ profile }: { profile: SkillsProfileData }) {
  const initials = getUserInitials(profile.user.full_name, profile.user.email);
  const name = profile.user.full_name?.trim() || profile.user.email || "Mechanic";

  if (profile.user.avatar_url) {
    return (
      <img
        src={profile.user.avatar_url}
        alt={name}
        className="h-16 w-16 rounded-full object-cover ring-2 ring-black/[0.06]"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-lg font-bold text-primary ring-2 ring-black/[0.06]">
      {initials}
    </div>
  );
}

function TotalExperienceRow({ hours }: { hours: number }) {
  return (
    <div className="flex w-full items-center gap-3 px-1 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">Total</p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
        {formatSkillsHours(hours)}h
      </p>
    </div>
  );
}

function ExperienceRowButton({
  label,
  hours,
  entryCount,
  onClick,
}: {
  label: string;
  hours: number;
  entryCount: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-1 py-3 text-left transition-colors hover:bg-muted/40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {entryCount} {entryCount === 1 ? "log entry" : "log entries"}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {formatSkillsHours(hours)}h
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function LogEntryList({
  entries,
  showAircraft = false,
}: {
  entries: SkillsProfileData["logbookEntries"];
  showAircraft?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No log entries in this group.</p>
    );
  }

  return (
    <ul className="divide-y divide-border/25">
      {entries.map((entry) => {
        const ataLabels = extractAtaChapterLabels(entry);
        const info = parseLogbookAdditionalInformation(entry.additional_information);

        return (
          <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {entry.description}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatUiDate(entry.entry_date)} · {formatSkillsHours(Number(entry.hours_worked) || 0)}h ·{" "}
                  {entry.status}
                </p>
                {showAircraft && entry.aircraft?.trim() ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aircraft: {entry.aircraft}
                  </p>
                ) : null}
                {ataLabels.length > 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ataLabels.join(" · ")}
                  </p>
                ) : null}
                {info.engine || info.propeller ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[info.engine ? `Engine: ${info.engine}` : null, info.propeller ? `Prop: ${info.propeller}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DetailSheet({
  panel,
  profile,
  onClose,
  onSelectExternalCert,
}: {
  panel: DetailPanel;
  profile: SkillsProfileData;
  onClose: () => void;
  onSelectExternalCert: (certId: string) => void;
}) {
  const externalCert = useMemo(() => {
    if (panel?.kind !== "external-cert") return null;
    return profile.externalCertifications.find((c) => c.id === panel.certId) ?? null;
  }, [panel, profile.externalCertifications]);

  const aircraftEntries = useMemo(() => {
    if (panel?.kind !== "aircraft") return [];
    return filterExperienceEntries(panel.row, "aircraft");
  }, [panel]);

  const engineEntries = useMemo(() => {
    if (panel?.kind !== "engine") return [];
    return filterExperienceEntries(panel.row, "engine");
  }, [panel]);

  const propellerEntries = useMemo(() => {
    if (panel?.kind !== "propeller") return [];
    return filterExperienceEntries(panel.row, "propeller");
  }, [panel]);

  const ataEntries = useMemo(() => {
    if (panel?.kind !== "ata") return [];
    return filterExperienceEntries(panel.row, "ata");
  }, [panel]);

  let title = "";
  let description = "";

  if (panel?.kind === "certifications") {
    title = "Certifications";
    description = "Awarded credentials with dates and supporting documents.";
  } else if (panel?.kind === "trainings") {
    title = "Completed training";
    description = "Programs and courses completed on or off platform.";
  } else if (
    panel?.kind === "aircraft" ||
    panel?.kind === "engine" ||
    panel?.kind === "propeller" ||
    panel?.kind === "ata"
  ) {
    title =
      panel.kind === "engine"
        ? `Engine: ${panel.row.label}`
        : panel.kind === "propeller"
          ? `Propeller: ${panel.row.label}`
          : panel.row.label;
    description = `${formatSkillsHours(panel.row.totalHours)} hours across ${panel.row.entryCount} log entries`;
  } else if (panel?.kind === "external-cert" && externalCert) {
    title = externalCert.name;
    description = externalCertificationTypeLabel(
      externalCert.certification_type,
      externalCert.certification_type_other
    );
  }

  return (
    <Sheet open={panel != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {panel ? (
          <>
            <SheetHeader>
              <SheetTitle>{title}</SheetTitle>
              {description ? <SheetDescription>{description}</SheetDescription> : null}
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {panel.kind === "certifications" ? (
                <>
                  {profile.certificationAwards.length === 0 &&
                  profile.externalCertifications.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No certifications recorded yet.
                    </p>
                  ) : null}

                  {profile.certificationAwards.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className={titleClass}>Awarded certifications</h3>
                      <ul className="divide-y divide-border/25">
                        {profile.certificationAwards.map((row) => (
                          <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                            <p className="text-sm font-medium">{row.certification_name}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Awarded {formatUiDate(row.awarded_on)}
                            </p>
                            {row.notes ? (
                              <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {profile.externalCertifications.length > 0 ? (
                    <section className="space-y-3">
                      <h3 className={titleClass}>External certifications</h3>
                      <ul className="space-y-3">
                        {profile.externalCertifications.map((row) => (
                          <li
                            key={row.id}
                            className="rounded-md ring-1 ring-black/[0.06] overflow-hidden"
                          >
                            <button
                              type="button"
                              className="flex w-full items-start gap-3 p-3 text-left hover:bg-muted/30"
                              onClick={() => onSelectExternalCert(row.id)}
                            >
                              {row.document?.file_type?.startsWith("image/") ? (
                                <img
                                  src={row.document.file_url}
                                  alt={row.name}
                                  className="h-16 w-16 rounded object-cover"
                                />
                              ) : null}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">{row.name}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {externalCertificationTypeLabel(
                                    row.certification_type,
                                    row.certification_type_other
                                  )}{" "}
                                  · {row.issuing_organization}
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  Awarded {formatUiDate(row.awarded_on)}
                                  {row.expires_on
                                    ? ` · Expires ${formatUiDate(row.expires_on)}`
                                    : ""}
                                </p>
                                {row.document ? (
                                  <a
                                    href={row.document.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-4"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    View certificate document
                                  </a>
                                ) : null}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </>
              ) : null}

              {panel.kind === "trainings" ? (
                profile.trainingCompletions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No completed training recorded yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/25">
                    {profile.trainingCompletions.map((row) => (
                      <li key={`${row.source}-${row.id}`} className="py-3 first:pt-0 last:pb-0">
                        <p className="text-sm font-medium">{row.training_name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Completed {formatUiDate(row.completed_on)} ·{" "}
                          {row.source === "platform"
                            ? "Hangar13 program"
                            : "External / manual"}
                        </p>
                        {row.notes ? (
                          <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}

              {panel.kind === "aircraft" ? (
                <LogEntryList entries={aircraftEntries} />
              ) : null}

              {panel.kind === "engine" ? (
                <LogEntryList entries={engineEntries} showAircraft />
              ) : null}

              {panel.kind === "propeller" ? (
                <LogEntryList entries={propellerEntries} showAircraft />
              ) : null}

              {panel.kind === "ata" ? (
                <LogEntryList entries={ataEntries} showAircraft />
              ) : null}

              {panel.kind === "external-cert" && externalCert ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium">{externalCert.issuing_organization}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Awarded {formatUiDate(externalCert.awarded_on)}
                      {externalCert.expires_on
                        ? ` · Expires ${formatUiDate(externalCert.expires_on)}`
                        : ""}
                    </p>
                    {externalCert.notes ? (
                      <p className="mt-2 text-sm text-muted-foreground">{externalCert.notes}</p>
                    ) : null}
                  </div>
                  {externalCert.document ? (
                    externalCert.document.file_type?.startsWith("image/") ? (
                      <img
                        src={externalCert.document.file_url}
                        alt={externalCert.name}
                        className="max-h-[480px] w-full rounded-md object-contain ring-1 ring-black/[0.06]"
                      />
                    ) : (
                      <a
                        href={externalCert.document.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex text-sm font-medium text-primary underline underline-offset-4"
                      >
                        Open certificate document ({externalCert.document.file_name})
                      </a>
                    )
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No document uploaded for this certification.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function SkillsProfilePageClient({ profile, backHref, backLabel }: Props) {
  const [detailPanel, setDetailPanel] = useState<DetailPanel>(null);

  const displayName =
    profile.user.full_name?.trim() || profile.user.email?.trim() || "Mechanic";

  const certCount =
    profile.certificationAwards.length + profile.externalCertifications.length;
  const trainingCount = profile.trainingCompletions.length;
  const aircraftCount = profile.aircraftExperience.length;
  const engineCount = profile.engineExperience.length;
  const propellerCount = profile.propellerExperience.length;
  const ataCount = profile.ataExperience.length;

  const credentialStatus = buildSkillsProfileCredentialStatus({
    mechanic_certificate_type: profile.user.mechanic_certificate_type,
    mechanic_certificate_number: profile.user.mechanic_certificate_number,
    current_certification: profile.user.current_certification,
    hasActiveEnrollment: profile.user.hasActiveEnrollment,
  });

  return (
    <>
      {backHref ? (
        <p className="text-sm text-muted-foreground">
          <Link href={backHref} className="text-primary underline underline-offset-4">
            {backLabel ?? "Back"}
          </Link>
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Skills profile</h1>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {profile.viewerIsOwner ? (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/dashboard/student/prior-ojt">
                <Wrench className="mr-2 h-4 w-4" />
                Prior OJT Experience
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => downloadSkillsProfilePdf(profile)}
          >
            <FileDown className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <div className={profileCardClass}>
            <div className="flex items-start gap-4">
              <ProfileAvatar profile={profile} />
              <div className="min-w-0 flex-1 space-y-1">
                <h2 className="text-xl font-bold tracking-tight">{displayName}</h2>
                {profile.user.email ? (
                  <p className="text-sm text-muted-foreground">{profile.user.email}</p>
                ) : null}
                {credentialStatus.lines.length > 0 ? (
                  <div className="space-y-0.5 pt-1">
                    {credentialStatus.lines.map((line) => (
                      <p key={line} className="text-sm text-foreground/85">
                        {line}
                      </p>
                    ))}
                  </div>
                ) : null}
                {!profile.viewerIsOwner ? (
                  <p className="pt-1 text-xs text-muted-foreground">Read-only view</p>
                ) : null}
              </div>
            </div>
          </div>

          <div className={profileCardClass}>
            <div className="space-y-8">
          <CollapsibleSection
            title="Certifications"
            defaultOpen
            titleClassName={titleClass}
            icon={<Award className="h-4 w-4" />}
            actions={
              profile.viewerIsOwner ? (
                <Button type="button" variant="outline" size="sm" asChild>
                  <Link href="/dashboard/student/external-certifications">
                    <Plus className="mr-2 h-4 w-4" />
                    Add
                  </Link>
                </Button>
              ) : undefined
            }
          >
            {certCount === 0 ? (
              <p className="text-sm text-muted-foreground">No certifications on file yet.</p>
            ) : (
              <div className="space-y-3">
                <ul className="divide-y divide-border/25">
                  {profile.externalCertifications.slice(0, 4).map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-left hover:bg-muted/30"
                        onClick={() => setDetailPanel({ kind: "external-cert", certId: row.id })}
                      >
                        {row.document?.file_type?.startsWith("image/") ? (
                          <img
                            src={row.document.file_url}
                            alt=""
                            className="h-9 w-9 rounded object-cover"
                          />
                        ) : (
                          <Award className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{row.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {row.issuing_organization}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                  {profile.certificationAwards.slice(0, 4).map((row) => (
                    <li key={row.id}>
                      <div className="py-2.5">
                        <p className="text-sm font-medium">{row.certification_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Awarded {formatUiDate(row.awarded_on)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-1"
                  onClick={() => setDetailPanel({ kind: "certifications" })}
                >
                  View all certifications
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </CollapsibleSection>

          <div className="border-t border-border/30 pt-8">
          <CollapsibleSection
            title="Completed training"
            defaultOpen
            titleClassName={titleClass}
            icon={<BookOpen className="h-4 w-4" />}
          >
            {trainingCount === 0 ? (
              <p className="text-sm text-muted-foreground">No completed training on file yet.</p>
            ) : (
              <div className="space-y-3">
                <ul className="divide-y divide-border/25">
                  {profile.trainingCompletions.slice(0, 5).map((row) => (
                    <li key={`${row.source}-${row.id}`} className="py-2.5 first:pt-0">
                      <p className="text-sm font-medium">{row.training_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatUiDate(row.completed_on)}
                      </p>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-1"
                  onClick={() => setDetailPanel({ kind: "trainings" })}
                >
                  {trainingCount > 5 ? "View all training" : "View details"}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </CollapsibleSection>
          </div>
            </div>
          </div>
        </div>

        <DashboardContentFrame className="space-y-0">
          <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-10">
            <CollapsibleSection
              title="OJT experience"
              defaultOpen
              titleClassName={titleClass}
              icon={<Wrench className="h-4 w-4" />}
              actions={
                profile.viewerIsOwner ? (
                  <Button type="button" variant="outline" size="sm" asChild>
                    <Link href="/dashboard/student/prior-ojt">
                      <Plus className="mr-2 h-4 w-4" />
                      Add prior OJT
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              {profile.totalOjtHours === 0 && ataCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No OJT hours recorded yet. Logbook entries with ATA chapters populate this
                  section.
                </p>
              ) : (
                <ul className="divide-y divide-border/25">
                  <li>
                    <TotalExperienceRow hours={profile.totalOjtHours} />
                  </li>
                  {profile.ataExperience.map((row) => (
                    <li key={row.key}>
                      <ExperienceRowButton
                        label={row.label}
                        hours={row.totalHours}
                        entryCount={row.entryCount}
                        onClick={() => setDetailPanel({ kind: "ata", row })}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </CollapsibleSection>

            <div className="space-y-8">
              <CollapsibleSection
                title="Airframe experience"
                defaultOpen
                titleClassName={titleClass}
                icon={<Plane className="h-4 w-4" />}
              >
                {aircraftCount === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No airframe-specific OJT logged yet. Add aircraft on logbook entries to build
                    this summary.
                  </p>
                ) : (
                  <ul className="divide-y divide-border/25">
                    {profile.aircraftExperience.map((row) => (
                      <li key={row.key}>
                        <ExperienceRowButton
                          label={row.label}
                          hours={row.totalHours}
                          entryCount={row.entryCount}
                          onClick={() => setDetailPanel({ kind: "aircraft", row })}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </CollapsibleSection>

              <CollapsibleSection
                title="Engine / Propeller Experience"
                defaultOpen
                titleClassName={titleClass}
                icon={<Cog className="h-4 w-4" />}
              >
                {engineCount === 0 && propellerCount === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No engine or propeller OJT logged yet. Add engine and propeller on logbook
                    entries to build this summary.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {engineCount > 0 ? (
                      <div>
                        {propellerCount > 0 ? (
                          <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                            Engines
                          </p>
                        ) : null}
                        <ul className="divide-y divide-border/25">
                          {profile.engineExperience.map((row) => (
                            <li key={`engine-${row.key}`}>
                              <ExperienceRowButton
                                label={row.label}
                                hours={row.totalHours}
                                entryCount={row.entryCount}
                                onClick={() => setDetailPanel({ kind: "engine", row })}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {propellerCount > 0 ? (
                      <div>
                        {engineCount > 0 ? (
                          <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                            Propellers
                          </p>
                        ) : null}
                        <ul className="divide-y divide-border/25">
                          {profile.propellerExperience.map((row) => (
                            <li key={`propeller-${row.key}`}>
                              <ExperienceRowButton
                                label={row.label}
                                hours={row.totalHours}
                                entryCount={row.entryCount}
                                onClick={() => setDetailPanel({ kind: "propeller", row })}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                )}
              </CollapsibleSection>
            </div>
          </div>
        </DashboardContentFrame>
      </div>

      <DetailSheet
        panel={detailPanel}
        profile={profile}
        onClose={() => setDetailPanel(null)}
        onSelectExternalCert={(certId) =>
          setDetailPanel({ kind: "external-cert", certId })
        }
      />
    </>
  );
}
