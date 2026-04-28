import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AssignedStudentsList } from "@/components/mentor/assigned-students-list";
import { AddStudentButton } from "@/components/mentor/add-student-button";
import { getEnrollmentLessonSnapshot } from "@/lib/training-progress";

async function getMentees(userId: string) {
  const supabase = await createServerSupabaseClient();

  // Get assigned students
  const { data: students, error: studentsError } = await supabase
    .from("user_trainings")
    .select("*")
    .eq("mentor_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const now = new Date();
  const targetHours = 5200; // Program target hours

  // Get profiles and progress data for students
  const studentsWithData = await Promise.all(
    (students || []).map(async (student) => {
      // Get profile
      const { data: profile } = await supabase
        .from("users")
        .select("id, email, full_name, avatar_url")
        .eq("id", student.user_id)
        .single();

      // Get all logbook entries for hours and pending count
      const { data: logbookEntries } = await supabase
        .from("logbook_entries")
        .select("*")
        .eq("user_training_id", student.id);

      // Calculate total hours
      const totalHours = logbookEntries?.reduce(
        (sum, entry) => sum + Number(entry.hours_worked || 0),
        0
      ) || 0;

      // Count pending entries (status = 'submitted')
      const pendingEntries = logbookEntries?.filter(
        (e) => e.status === "submitted"
      ).length || 0;

      // Calculate current week (weeks since start date)
      const startDate = new Date(student.start_date);
      const daysSinceStart = Math.floor(
        (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      const currentWeek = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

      // Calculate expected hours (assuming 40 hours per week average)
      const expectedHoursPerWeek = 40;
      const expectedHours = currentWeek * expectedHoursPerWeek;

      // Determine status based on hours progress
      const hoursProgress = (totalHours / targetHours) * 100;
      const expectedProgress = (expectedHours / targetHours) * 100;
      let progressStatus: "on_track" | "behind_pace" | "ahead" = "on_track";
      
      if (hoursProgress < expectedProgress - 10) {
        progressStatus = "behind_pace";
      } else if (hoursProgress > expectedProgress + 10) {
        progressStatus = "ahead";
      }

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
        hours: {
          total: totalHours,
          target: targetHours,
          progress: Math.round(hoursProgress),
        },
        weeks: {
          current: currentWeek,
        },
        progressStatus,
        pendingEntries,
      };
    })
  );

  return {
    mentees: studentsWithData,
  };
}

export default async function MenteeListPage() {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const data = await getMentees(user.id);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">My Students</h1>
          <p className="text-muted-foreground text-base">
            View and manage all your assigned students.
          </p>
        </div>
        <AddStudentButton mentorId={user.id} />
      </div>

      <AssignedStudentsList students={data.mentees} />
    </div>
  );
}
