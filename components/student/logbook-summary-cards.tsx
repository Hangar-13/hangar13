import { Card, CardContent } from "@/components/ui/card";
import { Clock } from "lucide-react";

interface SummaryCardProps {
  label: string;
  value: string | number;
}

function SummaryCard({ label, value }: SummaryCardProps) {
  return (
    <Card className="bg-card">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-bold">{value}</div>
            <p className="text-sm text-muted-foreground mt-1">{label}</p>
          </div>
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
      </CardContent>
    </Card>
  );
}

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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <SummaryCard label="Total Hours" value={totalHours} />
      <SummaryCard label="Pending" value={pendingCount} />
      <SummaryCard label="Signed" value={signedCount} />
      <SummaryCard label="Entries" value={totalEntries} />
    </div>
  );
}
