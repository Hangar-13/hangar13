import {
  DashboardStatCell,
  DashboardStatStrip,
} from "@/components/dashboard/page-shell";

interface DashboardStatStripProps {
  thisWeekHours: number;
  currentWeek: number;
  totalWeeks: number;
  lessonsCompleted: number;
  lessonsTotal: number;
  ataChaptersCompleted: number;
  totalAtaChapters: number;
}

export function MetricCards({
  thisWeekHours,
  currentWeek,
  totalWeeks,
  lessonsCompleted,
  lessonsTotal,
  ataChaptersCompleted,
  totalAtaChapters,
}: DashboardStatStripProps) {
  const weekLabel =
    totalWeeks > 0 ? `${currentWeek} of ${totalWeeks}` : currentWeek > 0 ? String(currentWeek) : "—";

  return (
    <DashboardStatStrip>
      <div className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:gap-y-0 sm:divide-x sm:divide-border/30">
        <DashboardStatCell
          value={`${thisWeekHours}h`}
          label="This week"
          detail={thisWeekHours === 0 ? "No entries yet" : undefined}
        />
        <DashboardStatCell value={weekLabel} label="Program week" />
        <DashboardStatCell
          value={lessonsTotal > 0 ? `${lessonsCompleted}/${lessonsTotal}` : lessonsCompleted}
          label="Lessons complete"
        />
        <DashboardStatCell
          value={`${ataChaptersCompleted}/${totalAtaChapters}`}
          label="ATA chapters"
        />
      </div>
    </DashboardStatStrip>
  );
}
