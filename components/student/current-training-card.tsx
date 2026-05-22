import { ArrowRight, Calendar } from "lucide-react";
import Link from "next/link";
import { formatUiDate } from "@/lib/format-ui-date";
import { DashboardAccentBlock } from "@/components/dashboard/page-shell";

interface CurrentTrainingCardProps {
  currentWeek: number;
  totalWeeks: number;
  topic: string;
  dueDate?: Date;
}

export function CurrentTrainingCard({
  currentWeek,
  totalWeeks,
  topic,
  dueDate,
}: CurrentTrainingCardProps) {
  return (
    <DashboardAccentBlock>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-wide text-foreground/70">
            {totalWeeks > 0 ? (
              <>Week {currentWeek} of {totalWeeks}</>
            ) : (
              <>Current training</>
            )}
          </p>
          <h2 className="text-lg font-bold leading-snug tracking-tight sm:text-xl">
            {topic}
          </h2>
          {dueDate ? (
            <p className="flex items-center gap-1.5 text-sm text-foreground/70">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Due {formatUiDate(dueDate)}
            </p>
          ) : null}
        </div>
        <Link
          href="/dashboard/student/training"
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-foreground transition-opacity hover:opacity-80"
        >
          View this week
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </DashboardAccentBlock>
  );
}
