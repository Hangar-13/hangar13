"use client";

import { usePathname } from "next/navigation";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { TrainingProgramSwitcherBar } from "@/components/student/training-program-switcher-bar";
import { isStudentTrainingSectionPath } from "@/lib/student-training-section-paths";

export function TrainingSwitcherDock() {
  const pathname = usePathname();
  const { trainingSwitcherData } = useAppNavigation();

  if (!isStudentTrainingSectionPath(pathname)) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-0 border-t border-border bg-background/95 px-4 py-0 backdrop-blur sm:px-6 supports-[backdrop-filter]:bg-background/60">
      <TrainingProgramSwitcherBar data={trainingSwitcherData} />
    </div>
  );
}
