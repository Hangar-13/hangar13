import { Progress } from "@/components/ui/progress";
import type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";
import {
  DashboardSectionLabel,
  DashboardStatStrip,
} from "@/components/dashboard/page-shell";

type Props = {
  stats: AcsCertificationProgressStats;
};

export function CertificationAcsProgressBars({ stats }: Props) {
  const { overall, domains } = stats;

  return (
    <div className="space-y-6">
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DashboardSectionLabel>Overall ACS progress</DashboardSectionLabel>
            <p className="mt-1 text-sm text-muted-foreground">
              {overall.required > 0 ? (
                <>
                  {overall.signed} of {overall.required} needed codes signed
                </>
              ) : (
                <>No ACS codes in scope for this certification goal</>
              )}
            </p>
          </div>
          <span className="shrink-0 text-2xl font-bold tabular-nums text-primary">
            {overall.percentage}%
          </span>
        </div>
        <Progress value={overall.percentage} className="h-2" />
      </div>

      {domains.length > 0 ? (
        <DashboardStatStrip>
          <div className="grid grid-cols-1 gap-y-5 sm:grid-cols-2 sm:gap-y-0 lg:grid-cols-3 lg:divide-x lg:divide-border/30">
            {domains.map((d) => (
              <div key={d.domain} className="min-w-0 space-y-2 px-4 first:pl-0 last:pr-0 sm:px-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug">{d.sectionTitle}</p>
                  <span className="shrink-0 text-lg font-bold tabular-nums text-secondary">
                    {d.percentage}%
                  </span>
                </div>
                <Progress
                  value={d.percentage}
                  className="h-1.5 bg-secondary/20"
                  indicatorClassName="bg-secondary"
                />
                <p className="text-[11px] text-muted-foreground">
                  {d.required > 0 ? (
                    <>
                      {d.signed} of {d.required} needed codes signed
                    </>
                  ) : (
                    <>No codes in database for this section</>
                  )}
                </p>
              </div>
            ))}
          </div>
        </DashboardStatStrip>
      ) : null}

      <p className="text-xs leading-snug text-muted-foreground">
        All required code counts represent 50% of total ACS codes for each section or overall.
      </p>
    </div>
  );
}
