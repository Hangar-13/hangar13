import Link from "next/link";
import { ArrowRight, Award } from "lucide-react";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";

type Props = {
  trainingCount: number;
  certificationCount: number;
};

export function CredentialsSummaryCard({ trainingCount, certificationCount }: Props) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Award className="h-3.5 w-3.5 text-primary" aria-hidden />
          <DashboardSectionLabel>My trainings</DashboardSectionLabel>
        </div>
        <Link
          href="/dashboard/student/credentials"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Manage
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">{trainingCount}</span> completed training
        {trainingCount === 1 ? "" : "s"},{" "}
        <span className="font-semibold text-foreground">{certificationCount}</span> certification
        {certificationCount === 1 ? "" : "s"} on record.
      </p>
    </section>
  );
}
