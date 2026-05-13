"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

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

  if (milestones.length === 0) {
    return (
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Milestones</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add lessons to your training path to see milestones here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Milestones</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-6">
            {milestones.map((milestone, index) => {
              const isCompleted = currentWeek >= milestone.week;

              return (
                <div
                  key={`${milestone.week}-${index}`}
                  className="relative flex items-center gap-4"
                >
                  <div
                    className={cn(
                      "relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 bg-background",
                      isCompleted
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-6 w-6" />
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
      </CardContent>
    </Card>
  );
}
