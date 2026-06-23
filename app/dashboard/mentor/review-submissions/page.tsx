import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import {
  PendingLessonSubmissions,
  type PendingLessonSubmission,
} from "@/components/mentor/pending-lesson-submissions";
import { fetchActiveEnrollmentIdsForMentor } from "@/lib/mentor-enrollments";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";

type SubmissionRow = {
  id: string;
  user_training_id: string;
  week_number: number | null;
  reflection_text: string | null;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  mentor_notes: string | null;
  lessons: { title: string | null } | { title: string | null }[] | null;
  lesson_submission_files:
    | {
        id: string;
        file_url: string;
        file_name: string;
        file_type: string | null;
      }[]
    | null;
};

async function getMentorSubmissions(
  userId: string
): Promise<PendingLessonSubmission[]> {
  const supabase = await createServerSupabaseClient();

  const enrollmentIds = await fetchActiveEnrollmentIdsForMentor(supabase, userId);
  if (enrollmentIds.length === 0) {
    return [];
  }

  // Map enrollment -> trainee user id so we can attach student profiles.
  const { data: utRows } = await supabase
    .from("user_trainings")
    .select("id, user_id")
    .in("id", enrollmentIds);

  const userIdByEnrollment = new Map<string, string>();
  for (const r of utRows ?? []) {
    userIdByEnrollment.set(r.id, r.user_id);
  }

  const { data: submissions } = await supabase
    .from("lesson_submissions")
    .select(
      `
      id,
      user_training_id,
      week_number,
      reflection_text,
      status,
      submitted_at,
      approved_at,
      reject_reason,
      mentor_notes,
      lessons ( title ),
      lesson_submission_files ( id, file_url, file_name, file_type )
    `
    )
    .in("user_training_id", enrollmentIds)
    .not("submitted_at", "is", null)
    .order("submitted_at", { ascending: false });

  const rows = (submissions ?? []) as SubmissionRow[];

  const traineeUserIds = [...new Set([...userIdByEnrollment.values()])];
  const profileByUserId = new Map<
    string,
    { full_name: string | null; email: string | null }
  >();
  if (traineeUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("users")
      .select("id, full_name, email")
      .in("id", traineeUserIds);
    for (const p of profiles ?? []) {
      profileByUserId.set(p.id, { full_name: p.full_name, email: p.email });
    }
  }

  return rows.map((row) => {
    const lesson = Array.isArray(row.lessons) ? row.lessons[0] : row.lessons;
    const traineeUserId = userIdByEnrollment.get(row.user_training_id) ?? "";
    const profile = profileByUserId.get(traineeUserId);
    return {
      id: row.id,
      user_training_id: row.user_training_id,
      week_number: row.week_number,
      reflection_text: row.reflection_text,
      status: row.status,
      submitted_at: row.submitted_at,
      approved_at: row.approved_at,
      reject_reason: row.reject_reason,
      mentor_notes: row.mentor_notes,
      lesson_title: lesson?.title ?? null,
      student_name:
        profile?.full_name || profile?.email || "Unknown Student",
      student_email: profile?.email ?? null,
      files: row.lesson_submission_files ?? [],
    } satisfies PendingLessonSubmission;
  });
}

interface PageProps {
  searchParams: Promise<{
    student?: string;
    openSubmission?: string;
  }>;
}

export default async function ReviewSubmissionsPage({ searchParams }: PageProps) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const params = await searchParams;
  const studentName = params.student || "";
  const openSubmissionId = params.openSubmission || "";

  const submissions = await getMentorSubmissions(user.id);

  return (
    <DashboardPageShell>
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Review Weekly Submissions
        </h1>
        <p className="text-base text-muted-foreground">
          Review your students&apos; weekly reflections and approve or reject
          them with feedback.
        </p>
      </div>

      <DashboardContentFrame>
        <PendingLessonSubmissions
          submissions={submissions}
          initialNameFilter={studentName}
          initialOpenSubmissionId={openSubmissionId}
        />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}
