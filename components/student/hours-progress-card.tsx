import { Progress } from "@/components/ui/progress";

interface HoursProgressCardProps {
  completedHours: number;
  targetHours: number;
  status?: "on_pace" | "behind" | "ahead";
  apprenticeship?: { monthsCompleted: number; monthsRequired: number } | null;
}

export function HoursProgressCard({
  completedHours,
  targetHours,
  status = "behind",
  apprenticeship = null,
}: HoursProgressCardProps) {
  if (apprenticeship) {
    const percentage =
      apprenticeship.monthsRequired > 0
        ? Math.min(
            100,
            Math.round((apprenticeship.monthsCompleted / apprenticeship.monthsRequired) * 100)
          )
        : 0;
    return (
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Apprenticeship progress
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {apprenticeship.monthsCompleted}
              </span>
              {" of "}
              {apprenticeship.monthsRequired} months
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
      </div>
    );
  }

  void targetHours;
  void status;

  return (
    <div className="space-y-2.5">
      <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">
        OJT logbook hours
      </p>
      <p className="text-2xl font-bold tabular-nums">
        {completedHours.toLocaleString()}
        <span className="ml-2 text-sm font-medium text-muted-foreground">hours logged</span>
      </p>
    </div>
  );
}
