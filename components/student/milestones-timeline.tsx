"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle } from "lucide-react";

interface MilestonesTimelineProps {
  currentWeek: number;
}

const milestones = [
  { week: 13, label: "First Quarter Week 13" },
  { week: 26, label: "6 Months Week 26" },
  { week: 52, label: "1 Year Week 52" },
  { week: 78, label: "18 Months Week 78" },
  { week: 104, label: "2 Years Week 104" },
  { week: 130, label: "Completion Week 130" },
];

export function MilestonesTimeline({ currentWeek }: MilestonesTimelineProps) {
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Milestones</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
          
          {/* Milestone items */}
          <div className="space-y-6">
            {milestones.map((milestone, index) => {
              const isCompleted = currentWeek >= milestone.week;
              const isUpcoming = index === milestones.findIndex(m => m.week > currentWeek);
              
              return (
                <div key={milestone.week} className="relative flex items-center gap-4">
                  {/* Circle icon */}
                  <div className={cn(
                    "relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2 bg-background",
                    isCompleted ? "border-primary bg-primary text-primary-foreground" : "border-border"
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-6 w-6" />
                    ) : (
                      <span className="text-sm font-semibold">{milestone.week}</span>
                    )}
                  </div>
                  
                  {/* Label */}
                  <div className={cn(
                    "text-sm",
                    isCompleted ? "font-semibold" : "text-muted-foreground"
                  )}>
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
