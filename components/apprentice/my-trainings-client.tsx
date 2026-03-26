"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { setCurrentUserTraining } from "@/app/actions/my-trainings";
import {
  describeUserTraining,
  type UserTrainingRowWithPlan,
} from "@/lib/my-trainings-display";

type Props = {
  inProgress: UserTrainingRowWithPlan[];
  completed: UserTrainingRowWithPlan[];
  currentUserTrainingId: string | null;
};

function formatCompletionDate(endDate: string | null, startDate: string): string {
  if (endDate) {
    return new Date(endDate + "T12:00:00").toLocaleDateString(undefined, {
      dateStyle: "medium",
    });
  }
  return new Date(startDate + "T12:00:00").toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

export function MyTrainingsClient({
  inProgress,
  completed,
  currentUserTrainingId,
}: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onMakeCurrent(id: string) {
    setError(null);
    setBusyId(id);
    const res = await setCurrentUserTraining(id);
    setBusyId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-10">
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          In-progress Training
        </h2>
        {inProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No trainings in progress. Use Find Training to enroll when available.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border/80">
            {inProgress.map((row) => {
              const { title, detail } = describeUserTraining(row);
              const isCurrent = currentUserTrainingId === row.id;
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-foreground">{title}</p>
                    {detail ? (
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {detail}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 sm:pt-0.5">
                    {isCurrent ? (
                      <span
                        className="inline-flex items-center rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                        aria-current="true"
                      >
                        Current Training
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === row.id}
                        onClick={() => onMakeCurrent(row.id)}
                      >
                        {busyId === row.id ? "Updating…" : "Make current training"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Completed Training
        </h2>
        {completed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No completed trainings yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border/80">
            {completed.map((row) => {
              const { title, detail } = describeUserTraining(row);
              return (
                <li key={row.id} className="p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium text-foreground">{title}</p>
                      {detail ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {detail}
                        </p>
                      ) : null}
                    </div>
                    <p className="shrink-0 text-sm text-muted-foreground tabular-nums sm:pt-0.5">
                      Completed{" "}
                      {formatCompletionDate(row.end_date, row.start_date)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
