import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TrendingUp } from "lucide-react";

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
  const percentage = targetHours > 0 ? Math.round((completedHours / targetHours) * 100) : 0;

  const getStatusColor = () => {
    switch (status) {
      case "on_pace":
        return "text-blue-600";
      case "ahead":
        return "text-green-600";
      default:
        return "text-green-500";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "on_pace":
        return "On Pace";
      case "ahead":
        return "Ahead of Pace";
      default:
        return "Behind Pace";
    }
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Hours Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-3xl font-bold mb-1">{completedHours.toLocaleString()}</div>
          <p className="text-sm text-muted-foreground">of {targetHours.toLocaleString()} hours</p>
        </div>
        <Progress value={percentage} className="h-3" />
        <div className="flex items-center gap-1 text-sm">
          <TrendingUp className={`h-4 w-4 ${getStatusColor()}`} />
          <span className={getStatusColor()}>{getStatusText()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
