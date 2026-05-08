"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { setCurrentUserTraining } from "@/app/actions/my-trainings";
import { useAppNavigation } from "@/components/app-navigation-provider";
import type { TrainingProgramSwitcherInitialData } from "@/lib/my-trainings-display";
import {
  describeUserTrainingEnrollment,
} from "@/lib/my-trainings-display";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  data: TrainingProgramSwitcherInitialData | null;
};

export function TrainingProgramSwitcherBar({ data }: Props) {
  const router = useRouter();
  const { refreshTrainingSwitcher } = useAppNavigation();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const currentUserTrainingId = data?.currentUserTrainingId ?? null;
  const inProgress = data?.inProgress ?? [];

  const selectValue =
    currentUserTrainingId != null &&
    inProgress.some((r) => r.id === currentUserTrainingId)
      ? currentUserTrainingId
      : undefined;

  async function onProgramChange(userTrainingId: string) {
    setError(null);
    startTransition(async () => {
      const res = await setCurrentUserTraining(userTrainingId);
      if (res.error) {
        setError(res.error);
        return;
      }
      await refreshTrainingSwitcher();
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5" role="region" aria-label="Active training">
        <span className="text-sm text-muted-foreground shrink-0" id="active-training-label">
          Active training
        </span>
        {data === null ? (
          <span className="text-sm text-muted-foreground tabular-nums">…</span>
        ) : inProgress.length === 0 ? (
          <span className="text-sm text-foreground">—</span>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Select
              aria-labelledby="active-training-label"
              value={selectValue}
              onValueChange={onProgramChange}
              disabled={pending}
            >
              <SelectTrigger size="sm" className="h-8 w-full max-w-md min-w-[12rem] border-border shadow-none">
                <SelectValue placeholder="Select program…" />
              </SelectTrigger>
              <SelectContent position="popper">
                {inProgress.map((row) => {
                  const { title } = describeUserTrainingEnrollment(row);
                  return (
                    <SelectItem key={row.id} value={row.id}>
                      {title}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {pending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
            ) : null}
          </div>
        )}
      </div>
      {error ? (
        <p className="w-full text-xs text-destructive sm:w-auto" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
