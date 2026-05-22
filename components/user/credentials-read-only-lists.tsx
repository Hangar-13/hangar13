import type { CertificationAward, TrainingCompletion } from "@/app/actions/user-credentials";
import { formatUiDate } from "@/lib/format-ui-date";
import { Button } from "@/components/ui/button";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";
import { Award, GraduationCap, Trash2 } from "lucide-react";

type Props = {
  trainingCompletions: TrainingCompletion[];
  certificationAwards: CertificationAward[];
  emptyHint?: string;
  /** When set, show a remove control per row (e.g. own credentials page). */
  onDeleteTraining?: (id: string) => void | Promise<void>;
  onDeleteCertification?: (id: string) => void | Promise<void>;
  deleteBusyId?: string | null;
};

export function CredentialsReadOnlyLists({
  trainingCompletions,
  certificationAwards,
  emptyHint = "No records yet.",
  onDeleteTraining,
  onDeleteCertification,
  deleteBusyId,
}: Props) {
  return (
    <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
      <section className="space-y-3">
        <DashboardSectionLabel>
          <span className="inline-flex items-center gap-2">
            <GraduationCap className="h-3.5 w-3.5 text-primary" aria-hidden />
            Completed trainings
          </span>
        </DashboardSectionLabel>
        {trainingCompletions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {trainingCompletions.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-2 py-3 text-sm first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{row.training_name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Completed {formatUiDate(row.completed_on)}
                  </div>
                  {row.notes ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">{row.notes}</p>
                  ) : null}
                </div>
                {onDeleteTraining ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    disabled={deleteBusyId === row.id}
                    onClick={() => onDeleteTraining(row.id)}
                    aria-label={`Remove ${row.training_name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <DashboardSectionLabel>
          <span className="inline-flex items-center gap-2">
            <Award className="h-3.5 w-3.5 text-primary" aria-hidden />
            Certifications awarded
          </span>
        </DashboardSectionLabel>
        {certificationAwards.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <ul className="divide-y divide-border/50">
            {certificationAwards.map((row) => (
              <li
                key={row.id}
                className="flex items-start justify-between gap-2 py-3 text-sm first:pt-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-foreground">{row.certification_name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    Awarded {formatUiDate(row.awarded_on)}
                  </div>
                  {row.notes ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">{row.notes}</p>
                  ) : null}
                </div>
                {onDeleteCertification ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive"
                    disabled={deleteBusyId === row.id}
                    onClick={() => onDeleteCertification(row.id)}
                    aria-label={`Remove ${row.certification_name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
