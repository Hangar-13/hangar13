"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { setCurrentUserTraining } from "@/app/actions/my-trainings";
import {
  describeUserTrainingEnrollment,
  type UserTrainingEnrollmentRow,
} from "@/lib/my-trainings-display";

type Props = {
  inProgress: UserTrainingEnrollmentRow[];
  completed: UserTrainingEnrollmentRow[];
  currentUserTrainingId: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
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

  async function onMakeCurrent(userTrainingId: string) {
    setError(null);
    setBusyId(userTrainingId);
    const res = await setCurrentUserTraining(userTrainingId);
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
          In-progress programs
        </h2>
        {inProgress.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No programs in progress. Enroll via Find Training or your organization.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border/80">
            {inProgress.map((row) => {
              const { title, detail } = describeUserTrainingEnrollment(row);
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
                        Current program
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === row.id}
                        onClick={() => onMakeCurrent(row.id)}
                      >
                        {busyId === row.id ? "Updating…" : "Make current"}
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
          Completed programs
        </h2>
        {completed.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No completed programs yet.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border/80">
            {completed.map((row) => {
              const { title, detail } = describeUserTrainingEnrollment(row);
              const when =
                row.end_date && row.status === "completed"
                  ? row.end_date
                  : row.start_date;
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
                      {row.status === "completed" ? "Completed " : "Ended "}
                      {formatDate(when)}
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
