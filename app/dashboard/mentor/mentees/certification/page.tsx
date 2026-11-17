import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { CertificationDashboardClient } from "@/components/student/certification-dashboard-client";
import { StudentProgressHeader } from "@/components/mentor/student-progress-header";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForStudent } from "@/app/actions/progress";
import { getCertificationAwardsForUser } from "@/app/actions/user-credentials";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { getAcsCertificationProgressStats } from "@/app/actions/acs-certification-progress";
import { fetchTraineeUserIdsForMentor, mentorHasAccessToTrainee } from "@/lib/mentor-enrollments";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";

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

interface PageProps {
  searchParams: Promise<{ student?: string }>;
}

export default async function MentorStudentCertificationPage({ searchParams }: PageProps) {
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
          <h1 className="text-2xl font-bold tracking-tight">Student certification</h1>
          <p className="text-base text-muted-foreground">
            You have no assigned students. Assign students from My Students to view certification
            progress.
          </p>
        </div>
      </DashboardPageShell>
    );
  }

  let studentId =
    studentIdParam && students.some((a) => a.id === studentIdParam) ? studentIdParam : null;
  if (!studentId && studentIdParam) {
    const { data: enrollment } = await supabase
      .from("user_trainings")
      .select("user_id")
      .eq("id", studentIdParam)
      .maybeSingle();
    const ownerId = enrollment?.user_id as string | undefined;
    if (ownerId && students.some((a) => a.id === ownerId)) studentId = ownerId;
  }
  studentId = studentId ?? students[0].id;

  if (!studentIdParam || studentIdParam !== studentId) {
    redirect(`/dashboard/mentor/mentees/certification?student=${studentId}`);
  }

  if (!(await mentorHasAccessToTrainee(supabase, user.id, studentId))) {
    redirect("/dashboard/mentor/mentees");
  }

  const ctx = await getCurrentUserTrainingContext(supabase, studentId);
  const student = ctx.userTraining;

  if (!student) {
    const selectedStudent = students.find((s) => s.id === studentId);
    return (
      <DashboardPageShell>
        <div className="space-y-1">
          <StudentProgressHeader
            students={students}
            currentStudentId={studentId}
            basePath="/dashboard/mentor/mentees/certification"
            heading="Certification for"
          />
          <p className="text-base text-muted-foreground">
            {selectedStudent?.full_name?.trim() || "This student"} is not enrolled in a course yet.
          </p>
        </div>
      </DashboardPageShell>
    );
  }

  const [progressData, ataChapters, certificationAwards, acsProgressStats] = await Promise.all([
    getProgressDataForStudent(student),
    getAtaChapters(),
    getCertificationAwardsForUser(student.user_id),
    getAcsCertificationProgressStats(student.user_id, ctx.currentCertification),
  ]);

  const hasCurrentCert = ctx.currentCertification != null;
  const hasCompletedCerts = certificationAwards.length > 0;
  const defaultExistingOpen = !hasCurrentCert && hasCompletedCerts;

  const selectedStudent = students.find((s) => s.id === studentId);
  const studentName = selectedStudent?.full_name?.trim() || "Student";

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <StudentProgressHeader
          students={students}
          currentStudentId={studentId}
          basePath="/dashboard/mentor/mentees/certification"
          heading="Certification for"
        />
        <p className="text-base text-muted-foreground">
          Certification history and ACS progress for this student
        </p>
      </div>

      <DashboardContentFrame>
        <CertificationDashboardClient
          studentName={studentName}
          currentCertification={ctx.currentCertification}
          certificationAwards={certificationAwards}
          progressData={progressData}
          ataChapters={ataChapters.map((c) => ({
            chapter_number: c.chapter_number,
            title: c.title,
          }))}
          defaultExistingOpen={defaultExistingOpen}
          acsProgressStats={acsProgressStats}
          mentorMode
        />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}
