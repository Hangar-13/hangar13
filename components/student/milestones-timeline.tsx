"use client";

import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";

interface MilestonesTimelineProps {
  currentWeek: number;
  totalWeeks: number;
}

function buildMilestones(totalWeeks: number): { week: number; label: string }[] {
  if (totalWeeks <= 0) return [];
  if (totalWeeks === 1) {
    return [{ week: 1, label: "Program" }];
  }
  const fractions = [0.25, 0.5, 0.75, 1] as const;
  const labels = [
    "First quarter",
    "Halfway",
    "Three quarters",
    "Program complete",
  ] as const;
  const seen = new Set<number>();
  const out: { week: number; label: string }[] = [];
  for (let i = 0; i < fractions.length; i++) {
    const w = Math.max(
      1,
      Math.min(totalWeeks, Math.round(totalWeeks * fractions[i]))
    );
    if (seen.has(w)) continue;
    seen.add(w);
    out.push({
      week: w,
      label: `${labels[i]} · lesson ${w}`,
    });
  }
  return out;
}

export function MilestonesTimeline({
  currentWeek,
  totalWeeks,
}: MilestonesTimelineProps) {
  const milestones = buildMilestones(totalWeeks);

  return (
    <section className="space-y-4">
      <DashboardSectionLabel>Milestones</DashboardSectionLabel>
      {milestones.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Add lessons to your training path to see milestones here.
        </p>
      ) : (
        <div className="relative">
          <div className="absolute bottom-0 left-6 top-0 w-px bg-border/40" />
          <div className="space-y-5">
            {milestones.map((milestone, index) => {
              const isCompleted = currentWeek >= milestone.week;

              return (
                <div
                  key={`${milestone.week}-${index}`}
                  className="relative flex items-center gap-4"
                >
                  <div
                    className={cn(
                      "relative z-10 flex h-11 w-11 items-center justify-center rounded-full border-2 bg-background",
                      isCompleted
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <span className="text-sm font-semibold">{milestone.week}</span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "text-sm",
                      isCompleted ? "font-semibold" : "text-muted-foreground"
                    )}
                  >
                    {milestone.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
