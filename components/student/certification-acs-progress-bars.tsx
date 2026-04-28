import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";

type Props = {
  stats: AcsCertificationProgressStats;
};

export function CertificationAcsProgressBars({ stats }: Props) {
  const { overall, domains } = stats;
  const domainCount = domains.length;

  const gridClass =
    domainCount <= 1
      ? "grid grid-cols-1 gap-3"
      : domainCount === 2
        ? "grid grid-cols-1 gap-3 md:grid-cols-2"
        : "grid grid-cols-1 gap-3 md:grid-cols-3";

  return (
    <div className="space-y-4">
      <Card className="bg-[#6C5067] border-[#6C5067] py-[10px]">
        <CardContent className="px-6">
          <div className="flex items-center justify-between gap-4 mb-2">
            <div>
              <h2 className="text-2xl font-bold text-white leading-tight">Overall Progress</h2>
              <p className="text-white/80 mt-0.5 text-sm leading-snug">
                {overall.required > 0 ? (
                  <>
                    {overall.signed} of {overall.required} needed codes signed
                  </>
                ) : (
                  <>No ACS codes in scope for this certification goal</>
                )}
              </p>
            </div>
            <div className="text-3xl font-bold text-white shrink-0 tabular-nums leading-none">
              {overall.percentage}%
            </div>
          </div>
          <Progress value={overall.percentage} className="h-2" />
        </CardContent>
      </Card>

      {domains.length > 0 ? (
        <div className={gridClass}>
          {domains.map((d) => (
            <Card key={d.domain} className="bg-[#6C5067] border-[#6C5067] py-[10px]">
              <CardContent className="px-4">
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white leading-tight">{d.sectionTitle}</h3>
                    <p className="text-white/75 text-xs mt-0.5 leading-snug">
                      {d.required > 0 ? (
                        <>
                          {d.signed} of {d.required} needed codes signed
                        </>
                      ) : (
                        <>No codes in database for this section</>
                      )}
                    </p>
                  </div>
                  <span className="text-xl font-bold text-white shrink-0 tabular-nums leading-none">
                    {d.percentage}%
                  </span>
                </div>
                <Progress value={d.percentage} className="h-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground leading-snug pt-1">
        All required code counts represent 50% of total ACS codes for each section or overall.
      </p>
    </div>
  );
}
