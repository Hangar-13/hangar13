import type { CertificationAward, TrainingCompletion } from "@/app/actions/user-credentials";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, GraduationCap, Trash2 } from "lucide-react";

function formatDate(iso: string) {
  try {
    return new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

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
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" aria-hidden />
            Completed trainings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {trainingCompletions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyHint}</p>
          ) : (
            <ul className="space-y-3">
              {trainingCompletions.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{row.training_name}</div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      Completed {formatDate(row.completed_on)}
                    </div>
                    {row.notes ? (
                      <p className="text-muted-foreground text-xs mt-1.5">{row.notes}</p>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" aria-hidden />
            Certifications awarded
          </CardTitle>
        </CardHeader>
        <CardContent>
          {certificationAwards.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyHint}</p>
          ) : (
            <ul className="space-y-3">
              {certificationAwards.map((row) => (
                <li
                  key={row.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-foreground">{row.certification_name}</div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      Awarded {formatDate(row.awarded_on)}
                    </div>
                    {row.notes ? (
                      <p className="text-muted-foreground text-xs mt-1.5">{row.notes}</p>
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
        </CardContent>
      </Card>
    </div>
  );
}
