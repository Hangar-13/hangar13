/** Sidebar "Training" group: Current Training, Progress, Find Training, My Trainings. */
const STUDENT_TRAINING_NAV_PREFIXES = [
  "/dashboard/student/training",
  "/dashboard/student/progress",
  "/dashboard/student/find-training",
  "/dashboard/student/credentials",
] as const;

export function isStudentTrainingSectionPath(pathname: string | null | undefined): boolean {
  if (!pathname?.startsWith("/dashboard/student")) return false;
  const path = pathname.replace(/\/$/, "") || pathname;
  if (path === "/dashboard/student") return false;
  return STUDENT_TRAINING_NAV_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
}
