import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, CheckCircle2, XCircle, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface LogbookEntry {
  id: string;
  entry_date: string;
  hours_worked: number;
  description: string;
  skills_practiced: string[] | null;
  challenges_encountered: string | null;
  next_steps: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  created_at: string;
}

interface LogbookEntriesListProps {
  entries: LogbookEntry[];
}

export function LogbookEntriesList({ entries }: LogbookEntriesListProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case "approved":
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case "rejected":
        return <XCircle className="h-4 w-4 text-red-600" />;
      case "submitted":
        return <FileText className="h-4 w-4 text-blue-600" />;
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "approved":
        return "Approved";
      case "rejected":
        return "Rejected";
      case "submitted":
        return "Submitted";
      default:
        return "Draft";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Recent Logbook Entries</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No logbook entries yet. Start logging your work!
            </p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-4 p-4 rounded-lg border border-border hover:bg-accent/50 hover:shadow-sm transition-all"
              >
                <div className="mt-0.5">{getStatusIcon(entry.status)}</div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(entry.entry_date)}</span>
                      <Clock className="h-4 w-4 ml-2" />
                      <span>{entry.hours_worked} hrs</span>
                    </div>
                    <span
                      className={cn(
                        "text-xs px-2 py-1 rounded-full",
                        entry.status === "approved"
                          ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          : entry.status === "rejected"
                          ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                          : entry.status === "submitted"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {getStatusLabel(entry.status)}
                    </span>
                  </div>
                  <p className="text-sm">{entry.description}</p>
                  {entry.skills_practiced && entry.skills_practiced.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {entry.skills_practiced.map((skill: string, idx: number) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}
                  {entry.challenges_encountered && (
                    <p className="text-xs text-muted-foreground">
                      <strong>Challenges:</strong> {entry.challenges_encountered}
                    </p>
                  )}
                  {entry.next_steps && (
                    <p className="text-xs text-muted-foreground">
                      <strong>Next Steps:</strong> {entry.next_steps}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          {entries.length >= 5 && (
            <Link
              href="/dashboard/student/logbook"
              className="block text-center text-sm text-primary hover:underline"
            >
              View all logbook entries →
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

