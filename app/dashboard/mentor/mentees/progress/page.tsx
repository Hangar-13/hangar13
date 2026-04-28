import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { ProgressTrackingDashboard } from "@/components/student/progress-tracking-dashboard";
import { StudentProgressHeader } from "@/components/mentor/student-progress-header";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForStudent } from "@/app/actions/progress";

async function getMentorStudents(mentorId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: students, error } = await supabase
    .from("user_trainings")
    .select("id, user_id")
    .eq("mentor_id", mentorId)
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

  const profileMap = Object.fromEntries(
    (userRows ?? []).map((p) => [p.id, p.full_name])
  );

  return students.map((a) => ({
    id: a.id,
    full_name: profileMap[a.user_id] ?? null,
  }));
}

interface PageProps {
  searchParams: Promise<{ student?: string }>;
}

export default async function MentorStudentProgressPage({
  searchParams,
}: PageProps) {
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
          <h1 className="text-2xl font-bold tracking-tight">
            Student Progress
          </h1>
          <p className="text-muted-foreground text-base">
            You have no assigned students. Assign students from My
            Students to view their progress.
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
    redirect(`/dashboard/mentor/mentees/progress?student=${studentId}`);
  }

  const { data: student, error: studentError } = await supabase
    .from("user_trainings")
    .select("*")
    .eq("id", studentId)
    .single();

  if (studentError || !student || student.mentor_id !== user.id) {
    redirect("/dashboard/mentor/mentees");
  }

  const [progressData, ataChapters] = await Promise.all([
    getProgressDataForStudent(student),
    getAtaChapters(),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <StudentProgressHeader
          students={students}
          currentStudentId={studentId}
        />
        <p className="text-muted-foreground text-base">
          Track progress through the 30-month program
        </p>
      </div>

      <ProgressTrackingDashboard
        progressData={progressData}
        ataChapters={ataChapters.map((c) => ({
          chapter_number: c.chapter_number,
          title: c.title,
        }))}
      />
    </div>
  );
}
