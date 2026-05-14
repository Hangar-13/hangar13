"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PlayCircle, RefreshCw } from "lucide-react";
import { refreshTalentLessonProgress } from "@/app/actions/talent-lesson-progress";
import type { TalentLessonProgressSnapshot } from "@/lib/talentlms/fetch-lesson-progress";
import { formatUiDateTime } from "@/lib/format-ui-date";

function lessonActionLabel(percent: number): string {
  const rounded = Math.round(percent);
  if (rounded >= 100) {
    return "Review Lesson";
  }
  if (rounded <= 0) {
    return "Start Lesson";
  }
  return "Continue Lesson";
}

interface LessonProgressCardProps {
  weekNumber: number;
  initialSnapshot: TalentLessonProgressSnapshot;
}

export function LessonProgressCard({
  weekNumber,
  initialSnapshot,
}: LessonProgressCardProps) {
  const [snapshot, setSnapshot] = useState<TalentLessonProgressSnapshot>(initialSnapshot);
  const [isUpdating, setIsUpdating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleUpdateProgress = async () => {
    setActionError(null);
    setIsUpdating(true);
    try {
      const result = await refreshTalentLessonProgress(weekNumber);
      if ("error" in result) {
        setActionError(result.error);
      } else {
        setSnapshot(result);
      }
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Something went wrong updating progress."
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const talentHref = snapshot.talentUrl;

  const percent =
    snapshot.kind === "ready" ? Math.min(100, Math.max(0, snapshot.percent)) : null;

  return (
    <div className="space-y-4">
      {snapshot.kind === "ready" ? (
        <>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">
                {snapshot.granularity === "unit"
                  ? "This lesson unit"
                  : "Assigned Talent course"}
              </p>
              <p className="text-lg font-semibold tabular-nums">
                {Math.round(percent!)}% complete
              </p>
            </div>
            <Progress value={percent!} className="h-3" />
            {snapshot.statusLabel ? (
              <p className="text-xs text-muted-foreground">
                Talent status: {snapshot.statusLabel}
              </p>
            ) : null}
            {snapshot.detailNote ? (
              <p className="text-xs text-muted-foreground">{snapshot.detailNote}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Last updated {formatUiDateTime(snapshot.checkedAt)}
            </p>
          </div>
        </>
      ) : (
        <div className="space-y-1 rounded-md border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm text-muted-foreground">{snapshot.message}</p>
        </div>
      )}

      {actionError ? (
        <p className="text-sm text-destructive">{actionError}</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:max-w-md">
        {talentHref ? (
          <Button
            asChild
            size="lg"
            className="w-full gap-2 bg-[#8B4513] hover:bg-[#6B3410] text-white"
          >
            <a href={talentHref} target="_blank" rel="noopener noreferrer">
              <PlayCircle className="h-5 w-5 shrink-0" />
              {snapshot.kind === "ready"
                ? lessonActionLabel(snapshot.percent)
                : "Open Talent lesson"}
            </a>
          </Button>
        ) : (
          <Button size="lg" className="w-full" disabled variant="secondary">
            <PlayCircle className="h-5 w-5 shrink-0 mr-2" />
            No Talent lesson link
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full gap-2"
          onClick={handleUpdateProgress}
          disabled={isUpdating}
        >
          <RefreshCw
            className={`h-4 w-4 shrink-0 ${isUpdating ? "animate-spin" : ""}`}
          />
          {isUpdating ? "Updating…" : "Update Progress"}
        </Button>
      </div>
    </div>
  );
}
