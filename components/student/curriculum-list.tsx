import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CurriculumItem {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  difficulty_level: number;
  estimated_hours: number | null;
  order_index: number;
  status?: "not_started" | "in_progress" | "completed" | "reviewed";
  hours_spent?: number;
}

interface CurriculumListProps {
  items: CurriculumItem[];
}

export function CurriculumList({ items }: CurriculumListProps) {
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case "completed":
      case "reviewed":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "in_progress":
        return <TrendingUp className="h-5 w-5 text-blue-600" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "reviewed":
        return "Reviewed";
      case "in_progress":
        return "In Progress";
      default:
        return "Not Started";
    }
  };

  const getDifficultyColor = (level: number) => {
    if (level <= 2) return "text-green-600";
    if (level === 3) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Curriculum</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No curriculum items available.
            </p>
          ) : (
            items
              .sort((a, b) => a.order_index - b.order_index)
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="mt-0.5">{getStatusIcon(item.status)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold">{item.title}</h4>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded-full bg-muted",
                          getDifficultyColor(item.difficulty_level)
                        )}
                      >
                        Level {item.difficulty_level}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-muted-foreground">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {item.hours_spent ? (
                          <span>
                            {item.hours_spent} / {item.estimated_hours || "?"} hrs
                          </span>
                        ) : (
                          <span>{item.estimated_hours || "?"} hrs</span>
                        )}
                      </div>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded",
                          item.status === "completed" || item.status === "reviewed"
                            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                            : item.status === "in_progress"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                            : "bg-muted"
                        )}
                      >
                        {getStatusLabel(item.status)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

