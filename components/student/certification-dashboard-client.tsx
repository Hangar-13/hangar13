"use client";

import type { CertificationAward } from "@/app/actions/user-credentials";
import type { ProgressData } from "@/app/actions/progress";
import type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";
import type { Certification } from "@/lib/certification";
import { certificationProgressTitle } from "@/lib/certification";
import type { AtaChapterItem } from "./ata-chapter-coverage";
import { CollapsibleSection } from "./collapsible-section";
import { CertificationGoalSelector } from "./certification-goal-selector";
import { CertificationAcsProgress } from "./certification-acs-progress";
import { formatUiDate } from "@/lib/format-ui-date";
import { DashboardContentFrame } from "@/components/dashboard/page-shell";
import { CertificationExportModal } from "./certification-export-modal";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, Plus } from "lucide-react";
import Link from "next/link";

const titleClass =
  "text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground";

type Props = {
  studentName: string;
  currentCertification: Certification | null;
  certificationAwards: CertificationAward[];
  progressData: ProgressData;
  ataChapters: AtaChapterItem[];
  defaultExistingOpen: boolean;
  acsProgressStats: AcsCertificationProgressStats;
  mentorMode?: boolean;
};

export function CertificationDashboardClient({
  studentName,
  currentCertification,
  certificationAwards,
  progressData,
  ataChapters,
  defaultExistingOpen,
  acsProgressStats,
  mentorMode = false,
}: Props) {
  const hasCertGoal = currentCertification != null;
  const [exportOpen, setExportOpen] = useState(false);
  const progressSectionTitle = hasCertGoal
    ? `Progress toward ${certificationProgressTitle(currentCertification)}`
    : null;

  return (
    <>
    <DashboardContentFrame className="space-y-10">
      <CollapsibleSection
        title="Existing certifications"
        defaultOpen={defaultExistingOpen}
        titleClassName={titleClass}
        headerHoverHighlight={false}
        actions={
          mentorMode ? undefined : (
            <Button type="button" variant="outline" size="sm" asChild>
              <Link href="/dashboard/student/external-certifications">
                <Plus className="mr-2 h-4 w-4" />
                Add external certification
              </Link>
            </Button>
          )
        }
      >
        {certificationAwards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed certifications on file yet.</p>
        ) : (
          <ul className="divide-y divide-border/25">
            {certificationAwards.map((row) => (
              <li key={row.id} className="py-3 first:pt-0 last:pb-0">
                <div className="text-sm font-medium text-foreground">{row.certification_name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Awarded {formatUiDate(row.awarded_on)}
                </div>
                {row.notes ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">{row.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {mentorMode ? (
        hasCertGoal ? (
          <CollapsibleSection
            key={`cert-progress-${currentCertification}`}
            title={progressSectionTitle ?? "Certification progress"}
            defaultOpen={true}
            titleClassName={titleClass}
            headerHoverHighlight={false}
          >
            <CertificationAcsProgress
              progressData={progressData}
              ataChapters={ataChapters}
              progressStats={acsProgressStats}
            />
          </CollapsibleSection>
        ) : (
          <CollapsibleSection
            title="No current certification goal"
            collapsible={false}
            titleClassName={titleClass}
            headerHoverHighlight={false}
          >
            <CertificationGoalSelector currentCertification={currentCertification} readOnly />
          </CollapsibleSection>
        )
      ) : hasCertGoal ? (
        <CollapsibleSection
          key={`cert-progress-${currentCertification}`}
          title={progressSectionTitle ?? "Certification progress"}
          defaultOpen={true}
          titleClassName={titleClass}
          headerHoverHighlight={false}
          actions={
            <CertificationGoalSelector
              currentCertification={currentCertification}
              buttonLabel="Change Certification Goal"
            />
          }
        >
          <CertificationAcsProgress
            progressData={progressData}
            ataChapters={ataChapters}
            progressStats={acsProgressStats}
          />
        </CollapsibleSection>
      ) : (
        <CollapsibleSection
          title="No current certification goal"
          collapsible={false}
          titleClassName={titleClass}
          headerHoverHighlight={false}
          actions={
            <CertificationGoalSelector
              currentCertification={currentCertification}
              buttonLabel="Select Certification Goal"
            />
          }
        />
      )}
      <div className="border-t border-border/25 pt-6 flex flex-wrap gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href="/dashboard/student/skills">
            View skills profile
          </Link>
        </Button>
        <Button type="button" variant="outline" onClick={() => setExportOpen(true)}>
          <FileDown className="mr-2 h-4 w-4" />
          Print Report / Export Data
        </Button>
      </div>
    </DashboardContentFrame>

    <CertificationExportModal
      open={exportOpen}
      onOpenChange={setExportOpen}
      studentName={studentName}
      currentCertification={currentCertification}
      certificationAwards={certificationAwards}
      progressData={progressData}
      progressStats={acsProgressStats}
      ataChapters={ataChapters}
    />
    </>
  );
}
