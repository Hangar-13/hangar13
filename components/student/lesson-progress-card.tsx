import Link from "next/link";
import { PlayCircle } from "lucide-react";
import type { LessonPlayerProgress } from "@/lib/lesson-player";
import { Button } from "@/components/ui/button";
import { formatUiDate } from "@/lib/format-ui-date";

function actionLabel(progress: LessonPlayerProgress): string {
  const noun = progress.kind === "test" ? "Test" : "Lesson";
  if (progress.status === "passed" || progress.status === "completed" || progress.percent >= 100) {
    return `Review ${noun}`;
  }
  if (
    progress.status === "not_attempted" ||
    (progress.percent <= 0 &&
      progress.status !== "incomplete" &&
      progress.status !== "browsed")
  ) {
    return `Start ${noun}`;
  }
  return `Continue ${noun}`;
}

function LessonSemicircleGauge({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
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
      aria-label={label}
    >
      <svg viewBox="0 0 100 58" className="h-[88px] w-[152px] overflow-visible">
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

export function LessonProgressCard({
  initial,
}: {
  initial: LessonPlayerProgress;
}) {
  const progress = initial;
  const isComplete =
    progress.status === "passed" || progress.status === "completed";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex shrink-0 flex-col items-center gap-2 sm:items-start">
          <LessonSemicircleGauge
            percent={progress.percent}
            label={progress.kind === "test" ? "Lesson test progress" : "Lesson progress"}
          />
          {progress.statusLabel ? (
            <p className="text-sm text-muted-foreground">
              {progress.statusLabel}
              {isComplete && progress.updatedAt
                ? ` on ${formatUiDate(progress.updatedAt)}`
                : ""}
            </p>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[200px]">
          {progress.playHref ? (
            <Button asChild size="lg" className="w-full gap-2">
              <Link href={progress.playHref}>
                <PlayCircle className="h-5 w-5 shrink-0" />
                {actionLabel(progress)}
              </Link>
            </Button>
          ) : (
            <Button size="lg" className="w-full" disabled variant="secondary">
              <PlayCircle className="mr-2 h-5 w-5 shrink-0" />
              {progress.kind === "test" ? "No test" : "No lesson"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
