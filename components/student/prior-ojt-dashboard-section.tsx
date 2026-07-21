"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Wrench } from "lucide-react";
import { skipPriorOjtExperience } from "@/app/actions/prior-ojt";
import type { PriorOjtDashboardProgress } from "@/app/actions/prior-ojt";
import { Button } from "@/components/ui/button";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";

type Props = {
  progress: PriorOjtDashboardProgress;
};

export function PriorOjtDashboardSection({ progress }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ctaLabel =
    progress.status === "not_started"
      ? "Start Prior OJT Experience"
      : progress.status === "reviewing"
        ? "Review draft log entries"
        : "Continue Prior OJT Experience";

  function handleSkip() {
    setError(null);
    startTransition(async () => {
      const result = await skipPriorOjtExperience();
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <DashboardSectionLabel>Prior OJT Experience</DashboardSectionLabel>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Tell us about maintenance experience you already have. We&apos;ll turn your
            answers into draft logbook entries you can review before they count toward
            your OJT logbook.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          disabled={pending}
          onClick={handleSkip}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          No prior experience
        </Button>
      </div>

      <div className="rounded-md bg-primary/10 px-5 py-6 sm:px-7 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <Wrench className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <p className="text-lg font-bold tracking-tight sm:text-xl">
                {progress.status === "not_started"
                  ? "Capture your prior experience"
                  : "Pick up where you left off"}
              </p>
            </div>
            <p className="text-sm text-foreground/75">{progress.progressLabel}</p>
          </div>
          <Button asChild size="lg" className="h-12 shrink-0 px-6 text-base">
            <Link href="/dashboard/student/prior-ojt">
              {ctaLabel}
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
