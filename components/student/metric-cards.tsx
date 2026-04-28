import { Card, CardContent } from "@/components/ui/card";
import { Calendar, Clock, Target, Book } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  sublabel?: string;
  status?: "behind" | "on_track";
}

function MetricCard({ icon, value, label, sublabel, status }: MetricCardProps) {
  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sublabel && (
              <p className={cn(
                "text-xs",
                status === "behind" ? "text-green-500" : "text-muted-foreground"
              )}>
                {sublabel}
              </p>
            )}
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface MetricCardsProps {
  totalHours: number;
  targetHours: number;
  thisWeekHours: number;
  currentWeek: number;
  totalWeeks: number;
  ataChaptersCompleted: number;
  totalAtaChapters: number;
}

export function MetricCards({
  totalHours,
  targetHours,
  thisWeekHours,
  currentWeek,
  totalWeeks,
  ataChaptersCompleted,
  totalAtaChapters,
}: MetricCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        icon={<Calendar className="h-5 w-5" />}
        value={totalHours.toLocaleString()}
        label={`of ${targetHours.toLocaleString()} target`}
      />
      <MetricCard
        icon={<Clock className="h-5 w-5" />}
        value={`${thisWeekHours}h`}
        label="This Week"
        sublabel={thisWeekHours === 0 ? "Behind" : undefined}
        status={thisWeekHours === 0 ? "behind" : undefined}
      />
      <MetricCard
        icon={<Target className="h-5 w-5" />}
        value={currentWeek}
        label={`of ${totalWeeks} weeks`}
        sublabel="Current Week"
      />
      <MetricCard
        icon={<Book className="h-5 w-5" />}
        value={ataChaptersCompleted}
        label={`of ${totalAtaChapters} covered`}
        sublabel="ATA Chapters"
      />
    </div>
  );
}
