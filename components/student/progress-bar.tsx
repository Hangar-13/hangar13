import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  /** 0–100, training hours completed vs required. */
  percent: number;
  /** e.g. "12.5 / 80.0 training hours" */
  summary?: string | null;
  /** Shown as "{name} Progress"; falls back to "Program Progress" when missing. */
  trainingProgramName?: string | null;
}

export function ProgressBar({
  percent,
  summary,
  trainingProgramName,
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, Math.round(percent)));
  const label = `${trainingProgramName?.trim() || "Program"} progress`;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {summary ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{summary}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-2xl font-bold tabular-nums text-primary">
          {percentage}%
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}
