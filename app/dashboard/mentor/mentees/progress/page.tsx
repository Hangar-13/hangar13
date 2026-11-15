import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getProgressDataForStudent } from "@/app/actions/progress";
import { StudentProgressHeader } from "@/components/mentor/student-progress-header";
import { CourseProgressSelect } from "@/components/mentor/course-progress-select";
import { ProgressTrackingDashboard } from "@/components/student/progress-tracking-dashboard";
import { fetchTraineeUserIdsForMentor, mentorHasAccessToTrainee } from "@/lib/mentor-enrollments";
import { getEnrollmentLessonSnapshot } from "@/lib/training-progress";
import { Progress } from "@/components/ui/progress";
import {
  DashboardPageShell,
  DashboardSectionLabel,
} from "@/components/dashboard/page-shell";

async function getMentorStudents(mentorId: string) {
  const supabase = await createServerSupabaseClient();
  const userIds = await fetchTraineeUserIdsForMentor(supabase, mentorId);
  if (userIds.length === 0) return [];

  const { data: userRows } = await supabase
    .from("users")
    .select("id, full_name, current_user_training_id")
    .in("id", userIds);

  return (userRows ?? [])
    .map((profile) => ({
      id: profile.id as string,
      full_name: (profile.full_name as string | null) ?? null,
      currentTrainingId: (profile.current_user_training_id as string | null) ?? null,
    }))
    .sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
}

function pathName(value: unknown): string {
  const row = Array.isArray(value) ? value[0] : value;
  if (row && typeof row === "object" && "name" in row && typeof row.name === "string") {
    return row.name.trim() || "Course";
  }
  return "Course";
}

export default async function MentorStudentProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; course?: string }>;
}) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { student: studentIdParam, course: courseIdParam } = await searchParams;
  const students = await getMentorStudents(user.id);

  if (students.length === 0) {
    return (
      <DashboardPageShell>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Student Progress</h1>
          <p className="text-base text-muted-foreground">
            You have no assigned students. Assign students from My Students to view their progress.
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

  if (!(await mentorHasAccessToTrainee(supabase, user.id, studentId))) {
    redirect("/dashboard/mentor/mentees");
  }

  const { data: enrollmentRows } = await supabase
    .from("user_trainings")
    .select("id, user_id, training_path_id, start_date, status, enrollment_source, training_paths(name)")
    .eq("user_id", studentId)
    .eq("status", "active")
    .order("start_date", { ascending: false });

  const courses = (enrollmentRows ?? []).map((row) => ({
    id: row.id as string,
    name: pathName(row.training_paths),
    training_path_id: row.training_path_id as string,
    start_date: row.start_date as string,
    enrollment_source: (row.enrollment_source as string | null) ?? null,
    user_id: studentId,
  }));

  const selectedStudent = students.find((student) => student.id === studentId);
  const preferredId =
    selectedStudent?.currentTrainingId &&
    courses.some((course) => course.id === selectedStudent.currentTrainingId)
      ? selectedStudent.currentTrainingId
      : courses[0]?.id ?? null;
  const courseId =
    courseIdParam && courses.some((course) => course.id === courseIdParam)
      ? courseIdParam
      : preferredId;

  if (!studentIdParam || studentIdParam !== studentId || (courseId && courseIdParam !== courseId)) {
    const params = new URLSearchParams({ student: studentId });
    if (courseId) params.set("course", courseId);
    redirect(`/dashboard/mentor/mentees/progress?${params.toString()}`);
  }

  let completedLessons = 0;
  let totalLessons = 0;
  for (const course of courses) {
    const snapshot = await getEnrollmentLessonSnapshot(supabase, course.id, course);
    completedLessons += snapshot.completedItems;
    totalLessons += snapshot.totalItems;
  }
  const overallPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const selectedCourse = courses.find((course) => course.id === courseId) ?? null;
  const [progressData, ataChapters] = selectedCourse
    ? await Promise.all([
        getProgressDataForStudent(selectedCourse),
        getAtaChapters(),
      ])
    : [null, [] as Awaited<ReturnType<typeof getAtaChapters>>];

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <StudentProgressHeader
          students={students}
          currentStudentId={studentId}
          clearParams={["course"]}
        />
        <p className="text-base text-muted-foreground">
          Overall lesson progress across every course, then one course at a time.
        </p>
      </div>

      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <DashboardSectionLabel>Overall progress</DashboardSectionLabel>
            <p className="mt-1 text-sm text-muted-foreground">
              {courses.length === 0
                ? "Not enrolled in a course yet"
                : `${completedLessons} of ${totalLessons} lessons across ${courses.length} ${courses.length === 1 ? "course" : "courses"}`}
            </p>
          </div>
          <span className="shrink-0 text-2xl font-bold tabular-nums text-primary">
            {overallPercent}%
          </span>
        </div>
        <Progress value={overallPercent} className="h-2" />
      </div>

      {selectedCourse && progressData ? (
        <ProgressTrackingDashboard
          progressData={progressData}
          ataChapters={ataChapters.map((chapter) => ({
            chapter_number: chapter.chapter_number,
            title: chapter.title,
          }))}
          showProgramOverview={false}
          leading={
            <CourseProgressSelect courses={courses} currentCourseId={selectedCourse.id} />
          }
        />
      ) : (
        <p className="text-base text-muted-foreground">
          {selectedStudent?.full_name?.trim() || "This student"} is not enrolled in a course yet.
        </p>
      )}
    </DashboardPageShell>
  );
}
