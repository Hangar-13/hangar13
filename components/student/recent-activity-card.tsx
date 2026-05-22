import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatUiDate } from "@/lib/format-ui-date";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";

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
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <DashboardSectionLabel>Recent activity</DashboardSectionLabel>
        <Link
          href="/dashboard/student/logbook"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View logbook
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No logbook entries yet.{" "}
          <Link
            href="/dashboard/student/logbook?add=true"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Log your first entry
          </Link>
          .
        </p>
      ) : (
        <ul className="divide-y divide-border/25">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start justify-between gap-4 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {entry.description}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatUiDate(entry.entry_date)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-secondary">
                {entry.hours_worked}h
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
