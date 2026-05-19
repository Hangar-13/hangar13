"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlayCircle, RefreshCw } from "lucide-react";
import { refreshTalentLessonProgress } from "@/app/actions/talent-lesson-progress";
import type { TalentLessonProgressSnapshot } from "@/lib/talentlms/fetch-lesson-progress";
import { formatUiDate } from "@/lib/format-ui-date";

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

/** Semicircular arc gauge (speedometer-style); `pathLength={100}` maps stroke dash to percent. */
function LessonSemicircleGauge({ percent }: { percent: number }) {
  const p = Math.min(100, Math.max(0, percent));
  const arcPath = "M 10 54 A 40 40 0 0 1 90 54";

  return (
    <div
      className="relative flex h-[108px] w-[152px] shrink-0 flex-col items-center"
      aria-valuenow={Math.round(p)}
      aria-valuemin={0}
      aria-valuemax={100}
      role="meter"
      aria-valuetext={`${Math.round(p)} percent`}
      aria-label="Lesson progress"
    >
      <svg viewBox="0 0 100 58" className="w-[152px] h-[88px] overflow-visible">
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-muted/40"
          strokeLinecap="round"
          pathLength={100}
        />
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="10"
          className="text-primary"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={100}
          strokeDashoffset={100 - p}
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-center">
        <span className="text-3xl font-bold tabular-nums leading-none tracking-tight text-foreground">
          {Math.round(p)}
          <span className="text-xl font-semibold">%</span>
        </span>
      </div>
    </div>
  );
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

  const isComplete = snapshot.kind === "ready" && percent !== null && percent >= 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2 sm:items-start">
          {snapshot.kind === "ready" ? (
            <>
              <LessonSemicircleGauge percent={percent!} />
              {isComplete ? (
                <p className="text-sm text-muted-foreground">
                  Completed on {formatUiDate(snapshot.checkedAt)}
                </p>
              ) : null}
            </>
          ) : (
            <div className="w-full max-w-md rounded-md border border-border bg-muted/40 px-3 py-3 sm:max-w-sm">
              <p className="text-sm text-muted-foreground">{snapshot.message}</p>
            </div>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[200px]">
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

          {!isComplete ? (
            <Button
              type="button"
              variant="secondary"
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
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
