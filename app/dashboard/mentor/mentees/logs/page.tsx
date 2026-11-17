import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForUser } from "@/app/actions/progress";
import { StudentProgressHeader } from "@/components/mentor/student-progress-header";
import { ProgressTrackingDashboard } from "@/components/student/progress-tracking-dashboard";
import { fetchTraineeUserIdsForMentor, mentorHasAccessToTrainee } from "@/lib/mentor-enrollments";
import { DashboardPageShell } from "@/components/dashboard/page-shell";

async function getMentorStudents(mentorId: string) {
  const supabase = await createServerSupabaseClient();
  const userIds = await fetchTraineeUserIdsForMentor(supabase, mentorId);
  if (userIds.length === 0) return [];

  const { data: userRows } = await supabase
    .from("users")
    .select("id, full_name")
    .in("id", userIds);

  return (userRows ?? [])
    .map((profile) => ({
      id: profile.id as string,
      full_name: (profile.full_name as string | null) ?? null,
    }))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
}

export default async function MentorStudentLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { student: studentIdParam } = await searchParams;
  const students = await getMentorStudents(user.id);

  if (students.length === 0) {
    return (
      <DashboardPageShell>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Student Logs</h1>
          <p className="text-base text-muted-foreground">
            You have no assigned students. Assign students from My Students to view their logs.
          </p>
        </div>
      </DashboardPageShell>
    );
  }

  let studentId =
    studentIdParam && students.some((student) => student.id === studentIdParam)
      ? studentIdParam
      : null;
  if (!studentId && studentIdParam) {
    const { data: enrollment } = await supabase
      .from("user_trainings")
      .select("user_id")
      .eq("id", studentIdParam)
      .maybeSingle();
    const ownerId = enrollment?.user_id as string | undefined;
    if (ownerId && students.some((student) => student.id === ownerId)) studentId = ownerId;
  }
  studentId = studentId ?? students[0].id;

  if (!studentIdParam || studentIdParam !== studentId) {
    redirect(`/dashboard/mentor/mentees/logs?student=${studentId}`);
  }

  if (!(await mentorHasAccessToTrainee(supabase, user.id, studentId))) {
    redirect("/dashboard/mentor/mentees");
  }

  const [progressData, ataChapters] = await Promise.all([
    getProgressDataForUser(studentId),
    getAtaChapters(),
  ]);

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <StudentProgressHeader
          students={students}
          currentStudentId={studentId}
          basePath="/dashboard/mentor/mentees/logs"
          heading="Logs for"
        />
        <p className="text-base text-muted-foreground">
          Every log for this student, including logs that are not tied to a course.
        </p>
      </div>

      <ProgressTrackingDashboard
        progressData={progressData}
        ataChapters={ataChapters.map((chapter) => ({
          chapter_number: chapter.chapter_number,
          title: chapter.title,
        }))}
        showProgramOverview={false}
        showSummaryStats={false}
        showMilestones={false}
      />
    </DashboardPageShell>
  );
}
