import {
  DashboardStatCell,
  DashboardStatStrip,
} from "@/components/dashboard/page-shell";

interface LogbookSummaryCardsProps {
  totalHours: number;
  pendingCount: number;
  signedCount: number;
  totalEntries: number;
}

export function LogbookSummaryCards({
  totalHours,
  pendingCount,
  signedCount,
  totalEntries,
}: LogbookSummaryCardsProps) {
  return (
    <DashboardStatStrip>
      <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-border/30">
        <DashboardStatCell value={totalHours} label="Total hours" />
        <DashboardStatCell value={pendingCount} label="Pending" />
        <DashboardStatCell value={signedCount} label="Signed" />
        <DashboardStatCell value={totalEntries} label="Entries" />
      </div>
    </DashboardStatStrip>
  );
}
