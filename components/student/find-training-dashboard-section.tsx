import Link from "next/link";
import { ArrowRight, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";

export function FindTrainingDashboardSection() {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <DashboardSectionLabel>Training</DashboardSectionLabel>
        <p className="max-w-2xl text-sm text-muted-foreground">
          You don&apos;t have an active training program yet. Browse available programs and
          enroll when you&apos;re ready.
        </p>
      </div>

      <div className="rounded-md bg-muted/40 px-5 py-6 sm:px-7 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-foreground">
              <GraduationCap className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              <p className="text-lg font-bold tracking-tight sm:text-xl">
                No active trainings
              </p>
            </div>
            <p className="text-sm text-foreground/75">
              Find a training path that matches your certification goals.
            </p>
          </div>
          <Button asChild size="lg" className="h-12 shrink-0 px-6 text-base">
            <Link href="/dashboard/student/find-training">
              Find training
              <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
