import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { CertificationDashboardClient } from "@/components/student/certification-dashboard-client";
import { StudentProgressHeader } from "@/components/mentor/student-progress-header";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForStudent } from "@/app/actions/progress";
import { getCertificationAwardsForUser } from "@/app/actions/user-credentials";
import { getCurrentUserTrainingContext } from "@/lib/current-user-training";
import { getAcsCertificationProgressStats } from "@/app/actions/acs-certification-progress";
import { fetchActiveEnrollmentIdsForMentor, mentorHasAccessToEnrollment } from "@/lib/mentor-enrollments";

async function getMentorStudents(mentorId: string) {
  const supabase = await createServerSupabaseClient();

  const enrollmentIds = await fetchActiveEnrollmentIdsForMentor(supabase, mentorId);
  if (enrollmentIds.length === 0) {
    return [];
  }

  const { data: students, error } = await supabase
    .from("user_trainings")
    .select("id, user_id")
    .in("id", enrollmentIds)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error || !students?.length) {
    return [];
  }

  const userIds = students.map((a) => a.user_id);
  const { data: userRows } = await supabase
    .from("users")
    .select("id, full_name")
    .in("id", userIds);

  const profileMap = Object.fromEntries((userRows ?? []).map((p) => [p.id, p.full_name]));

  return students.map((a) => ({
    id: a.id,
    full_name: profileMap[a.user_id] ?? null,
  }));
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
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Student certification</h1>
          <p className="text-muted-foreground text-base">
            You have no assigned students. Assign students from My Students to view certification progress.
          </p>
        </div>
      </div>
    );
  }

  const studentId =
    studentIdParam && students.some((a) => a.id === studentIdParam)
      ? studentIdParam
      : students[0].id;

  if (!studentIdParam || studentIdParam !== studentId) {
    redirect(`/dashboard/mentor/mentees/certification?student=${studentId}`);
  }

  const { data: student, error: studentError } = await supabase
    .from("user_trainings")
    .select("*")
    .eq("id", studentId)
    .single();

  if (studentError || !student || !(await mentorHasAccessToEnrollment(supabase, user.id, studentId))) {
    redirect("/dashboard/mentor/mentees");
  }

  const ctx = await getCurrentUserTrainingContext(supabase, student.user_id);

  const [progressData, ataChapters, certificationAwards, acsProgressStats] = await Promise.all([
    getProgressDataForStudent(student),
    getAtaChapters(),
    getCertificationAwardsForUser(student.user_id),
    getAcsCertificationProgressStats(student.user_id, ctx.currentCertification),
  ]);

  const hasCurrentCert = ctx.currentCertification != null;
  const hasCompletedCerts = certificationAwards.length > 0;
  const defaultExistingOpen = !hasCurrentCert && hasCompletedCerts;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <StudentProgressHeader
          students={students}
          currentStudentId={studentId}
          basePath="/dashboard/mentor/mentees/certification"
          heading="Certification for"
        />
        <p className="text-muted-foreground text-base">
          Certification history and ACS progress for this student
        </p>
      </div>

      <CertificationDashboardClient
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
    </div>
  );
}
