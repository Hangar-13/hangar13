import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RecentActivityCardProps {
  entries: Array<{
    id: string;
    entry_date: string;
    description: string;
    hours_worked: number;
  }>;
}

export function RecentActivityCard({ entries }: RecentActivityCardProps) {
  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent activity. Start by logging your first entry!
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{entry.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(entry.entry_date).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <div className="text-sm font-semibold ml-4">
                  {entry.hours_worked}h
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
