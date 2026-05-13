import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { AssignedStudentsList, type AssignedStudent } from "@/components/mentor/assigned-students-list";
import { PendingLogbookEntries } from "@/components/mentor/pending-logbook-entries";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getEnrollmentLessonSnapshot } from "@/lib/training-progress";
import {
  fetchActiveEnrollmentIdsForMentor,
  fetchCurrentCurriculumIdsForUsers,
  fetchTraineeUserIdsForMentor,
  pickOneEnrollmentPerTrainee,
} from "@/lib/mentor-enrollments";
import type { UserTrainingRow } from "@/lib/current-user-training";

async function getMentorData(userId: string) {
  const supabase = await createServerSupabaseClient();

  const [enrollmentIds, traineeUserIds] = await Promise.all([
    fetchActiveEnrollmentIdsForMentor(supabase, userId),
    fetchTraineeUserIdsForMentor(supabase, userId),
  ]);

  const enrollmentByTraineeUserId = new Map<string, string>();
  let canonicalEnrollments: UserTrainingRow[] = [];
  if (enrollmentIds.length > 0) {
    const { data: utRows, error: utErr } = await supabase
      .from("user_trainings")
      .select("*")
      .in("id", enrollmentIds)
      .eq("status", "active");
    if (utErr) {
      console.error("getMentorData enrollments:", utErr);
    }
    const activeRows = (utRows ?? []) as UserTrainingRow[];
    const userIds = [...new Set(activeRows.map((r) => r.user_id))];
    const curriculumMap = await fetchCurrentCurriculumIdsForUsers(supabase, userIds);
    canonicalEnrollments = pickOneEnrollmentPerTrainee(activeRows, curriculumMap);
    for (const r of canonicalEnrollments) {
      enrollmentByTraineeUserId.set(r.user_id, r.id);
    }
  }

  async function attachEntryContext(entry: Record<string, unknown> & { user_id: string }) {
    let utId = enrollmentByTraineeUserId.get(entry.user_id) ?? null;
    if (!utId) {
      const { data: ut } = await supabase
        .from("user_trainings")
        .select("id")
        .eq("user_id", entry.user_id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      utId = ut?.id ?? null;
    }
    const { data: profile } = await supabase
      .from("users")
      .select("id, full_name, email")
      .eq("id", entry.user_id)
      .single();

    return {
      ...entry,
      user_trainings: {
        id: utId ?? "",
        user_id: entry.user_id,
        users: profile,
      },
    };
  }

  const now = new Date();
  const targetHours = 5200;

  let studentsWithProfiles: AssignedStudent[] = [];

  if (canonicalEnrollments.length > 0) {
    studentsWithProfiles = await buildStudentCards(supabase, canonicalEnrollments, now, targetHours);
  }

  let logbookEntries: any[] = [];
  if (traineeUserIds.length > 0) {
    const { data: entries } = await supabase
      .from("logbook_entries")
      .select("*")
      .in("user_id", traineeUserIds)
      .order("entry_date", { ascending: false });

    logbookEntries = await Promise.all((entries ?? []).map(attachEntryContext));
  }

  return {
    students: studentsWithProfiles,
    logbookEntries,
  };
}

async function buildStudentCards(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  students: UserTrainingRow[],
  now: Date,
  targetHours: number
): Promise<AssignedStudent[]> {
  return Promise.all(
    students.map(async (student) => {
      const { data: profile } = await supabase
        .from("users")
        .select("id, email, full_name, avatar_url")
        .eq("id", student.user_id)
        .single();

      const { data: logbookEntries } = await supabase
        .from("logbook_entries")
        .select("*")
        .eq("user_id", student.user_id);

      const totalHours = logbookEntries?.reduce(
        (sum: number, entry: { hours_worked?: number }) => sum + Number(entry.hours_worked || 0),
        0
      ) || 0;

      const pendingEntries = logbookEntries?.filter(
        (e: { status: string }) => e.status === "submitted"
      ).length || 0;

      const startDate = new Date(student.start_date);
      const daysSinceStart = Math.floor(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

      const expectedHoursPerWeek = 40;
      const expectedHours = currentWeek * expectedHoursPerWeek;
      const hoursProgress = (totalHours / targetHours) * 100;
      const expectedProgress = (expectedHours / targetHours) * 100;
      let progressStatus: "on_track" | "behind_pace" | "ahead" = "on_track";
      if (hoursProgress < expectedProgress - 10) progressStatus = "behind_pace";
      else if (hoursProgress > expectedProgress + 10) progressStatus = "ahead";

      const {
        hoursCompleted,
        hoursRequired,
        trainingProgressPercent,
      } = await getEnrollmentLessonSnapshot(supabase, student.id, student);

      return {
        ...student,
        users: profile,
        progress: {
          overall: trainingProgressPercent,
          hoursCompleted,
          hoursRequired,
        },
        hours: { total: totalHours, target: targetHours, progress: Math.round(hoursProgress) },
        weeks: { current: currentWeek },
        progressStatus,
        pendingEntries,
      } as AssignedStudent;
    })
  );
}

export default async function MentorDashboard() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [data, ataChapters] = await Promise.all([
    getMentorData(user.id),
    getAtaChapters(),
  ]);

  const acsCodesByEntry =
    data.logbookEntries?.length > 0
      ? await getAcsCodesByEntry(data.logbookEntries.map((e: { id: string }) => e.id))
      : {};

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Mentor Dashboard</h1>
        <p className="text-muted-foreground text-base">
          Manage your students and review their logbook entries.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AssignedStudentsList students={data.students} compact />
        <PendingLogbookEntries
          entries={data.logbookEntries}
          acsCodesByEntry={acsCodesByEntry}
          ataChapters={ataChapters.map((c: { chapter_number: string; title: string }) => ({
            value: c.chapter_number,
            label: `${c.chapter_number} - ${c.title}`,
          }))}
        />
      </div>
    </div>
  );
}
