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
  const label = `${trainingProgramName?.trim() || "Program"} Progress`;

  return (
    <div className="py-2 gap-0">
      <div className="pb-1 px-4 pt-4">
        <div className="flex items-center justify-between gap-2 text-base">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse"></div>
            <span className="font-semibold leading-none">{label}</span>
          </div>
          <span className="font-bold text-primary">{percentage}%</span>
        </div>
        {summary ? (
          <p className="text-sm text-muted-foreground mt-1 pl-2">{summary}</p>
        ) : null}
      </div>
      <div className="px-4 pb-4 pt-1">
        <Progress value={percentage} className="h-3" />
      </div>
    </div>
  );
}

