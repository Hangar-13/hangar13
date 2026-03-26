"use client";

import type { CertificationAward } from "@/app/actions/user-credentials";
import type { ProgressData } from "@/app/actions/progress";
import type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";
import type { Certification } from "@/lib/certification";
import { certificationLabel } from "@/lib/certification";
import type { AtaChapterItem } from "./ata-chapter-coverage";
import { CollapsibleSection } from "./collapsible-section";
import { CertificationGoalSelector } from "./certification-goal-selector";
import { CertificationAcsProgress } from "./certification-acs-progress";

const titleClass = "text-lg font-bold tracking-tight text-foreground";

type Props = {
  currentCertification: Certification | null;
  certificationAwards: CertificationAward[];
  progressData: ProgressData;
  ataChapters: AtaChapterItem[];
  defaultExistingOpen: boolean;
  acsProgressStats: AcsCertificationProgressStats;
  mentorMode?: boolean;
};

export function CertificationDashboardClient({
  currentCertification,
  certificationAwards,
  progressData,
  ataChapters,
  defaultExistingOpen,
  acsProgressStats,
  mentorMode = false,
}: Props) {
  const hasCertGoal = currentCertification != null;

  return (
    <div className="space-y-4">
      <CollapsibleSection
        title="Existing certifications"
        defaultOpen={defaultExistingOpen}
        titleClassName={titleClass}
        headerHoverHighlight={false}
      >
        {certificationAwards.length === 0 ? (
          <p className="text-sm text-muted-foreground">No completed certifications on file yet.</p>
        ) : (
          <ul className="space-y-3">
            {certificationAwards.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
              >
                <div className="font-medium text-foreground">{row.certification_name}</div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  Awarded{" "}
                  {new Date(row.awarded_on + (row.awarded_on.length === 10 ? "T12:00:00" : "")).toLocaleDateString(
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" }
                  )}
                </div>
                {row.notes ? <p className="text-muted-foreground text-xs mt-1.5">{row.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </CollapsibleSection>

      {mentorMode ? (
        hasCertGoal ? (
          <CollapsibleSection
            key={`cert-progress-${currentCertification}`}
            title={`Progress toward ${certificationLabel(currentCertification)}`}
            defaultOpen={true}
            collapsible={true}
            titleClassName={titleClass}
            headerHoverHighlight={false}
          >
            <CertificationAcsProgress
              progressData={progressData}
              ataChapters={ataChapters}
              progressStats={acsProgressStats}
              mentorMode
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
          title={`Progress toward ${certificationLabel(currentCertification)}`}
          defaultOpen={true}
          collapsible={true}
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
    </div>
  );
}
