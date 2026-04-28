import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { AssignedStudentsList } from "@/components/mentor/assigned-students-list";
import { PendingLogbookEntries } from "@/components/mentor/pending-logbook-entries";
import { getAcsCodesByEntry } from "@/app/actions/logbook";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import { getEnrollmentLessonSnapshot } from "@/lib/training-progress";

async function getMentorData(userId: string) {
  const supabase = await createServerSupabaseClient();

  // Get assigned students
  const { data: students, error: studentsError } = await supabase
    .from("user_trainings")
    .select("*")
    .eq("mentor_id", userId)
    .eq("status", "active");

  const now = new Date();
  const targetHours = 5200;

  // Get profiles and progress data for students (for compact dashboard cards)
  const studentsWithProfiles = await Promise.all(
    (students || []).map(async (student) => {
      const { data: profile } = await supabase
        .from("users")
        .select("id, email, full_name, avatar_url")
        .eq("id", student.user_id)
        .single();

      const { data: logbookEntries } = await supabase
        .from("logbook_entries")
        .select("*")
        .eq("user_training_id", student.id);

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
      };
    })
  );

  // Get pending logbook entries from assigned students
  const studentIds = students?.map((a) => a.id) || [];

  let pendingEntries: any[] = [];
  if (studentIds.length > 0) {
    const { data: entries, error: entriesError } = await supabase
      .from("logbook_entries")
      .select("*")
      .in("user_training_id", studentIds)
      .eq("status", "submitted")
      .order("entry_date", { ascending: false });

    // Get student and profile info for each entry
    pendingEntries = await Promise.all(
      (entries || []).map(async (entry) => {
        const { data: student } = await supabase
          .from("user_trainings")
          .select("id, user_id")
          .eq("id", entry.user_training_id)
          .single();

        let profile = null;
        if (student?.user_id) {
          const { data: profileData } = await supabase
            .from("users")
            .select("id, full_name, email")
            .eq("id", student.user_id)
            .single();
          profile = profileData;
        }

        return {
          ...entry,
          user_trainings: student
            ? {
                ...student,
                users: profile,
              }
            : null,
        };
      })
    );
  }

  return {
    students: studentsWithProfiles,
    pendingEntries,
  };
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
    data.pendingEntries?.length > 0
      ? await getAcsCodesByEntry(data.pendingEntries.map((e: { id: string }) => e.id))
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
          entries={data.pendingEntries}
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
