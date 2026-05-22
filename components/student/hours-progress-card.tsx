import { Progress } from "@/components/ui/progress";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface HoursProgressCardProps {
  completedHours: number;
  targetHours: number;
  status?: "on_pace" | "behind" | "ahead";
}

export function HoursProgressCard({
  completedHours,
  targetHours,
  status = "behind",
}: HoursProgressCardProps) {
  const percentage =
    targetHours > 0 ? Math.min(100, Math.round((completedHours / targetHours) * 100)) : 0;

  const statusClass =
    status === "ahead"
      ? "text-emerald-600"
      : status === "on_pace"
        ? "text-secondary"
        : "text-amber-600";

  const statusText =
    status === "ahead"
      ? "Ahead of pace"
      : status === "on_pace"
        ? "On pace"
        : "Log hours this week";

  const StatusIcon = status === "behind" ? TrendingDown : TrendingUp;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">
            OJT logbook hours
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {completedHours.toLocaleString()}
            </span>
            {" of "}
            {targetHours.toLocaleString()} hours
          </p>
        </div>
        <span className="shrink-0 text-2xl font-bold tabular-nums text-secondary">
          {percentage}%
        </span>
      </div>
      <Progress
        value={percentage}
        className="h-2 bg-secondary/20"
        indicatorClassName="bg-secondary"
      />
      <p className={cn("flex items-center gap-1.5 text-xs font-medium", statusClass)}>
        <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {statusText}
      </p>
    </div>
  );
}
