import { createServerSupabaseClient } from "@/lib/supabase-server";
import { redirect } from "next/navigation";
import { AssignedStudentsList } from "@/components/mentor/assigned-students-list";
import { AddStudentButton } from "@/components/mentor/add-student-button";
import {
  DashboardContentFrame,
  DashboardPageShell,
} from "@/components/dashboard/page-shell";
import { getEnrollmentLessonSnapshot } from "@/lib/training-progress";
import {
  fetchCurrentCurriculumIdsForUsers,
  fetchTraineeUserIdsForMentor,
  pickOneEnrollmentPerTrainee,
} from "@/lib/mentor-enrollments";
import type { UserTrainingRow } from "@/lib/current-user-training";
import type { AssignedStudent } from "@/components/mentor/assigned-students-list";
import { getActiveOrgDashboardContext } from "@/lib/org-dashboard-context";
import { getActiveUser } from "@/lib/auth";
import { hasOrganizationRolePermission, hasPlatformAdminAccess } from "@/lib/auth-shared";

async function getMentees(userId: string): Promise<{ mentees: AssignedStudent[] }> {
  const supabase = await createServerSupabaseClient();

  // Roster is the canonical mentor relationship (profile-level), independent of
  // whether the student is enrolled in any training path.
  const traineeUserIds = await fetchTraineeUserIdsForMentor(supabase, userId);
  if (traineeUserIds.length === 0) {
    return { mentees: [] };
  }

  const { data: enrollmentRows } = await supabase
    .from("user_trainings")
    .select("*")
    .in("user_id", traineeUserIds)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const activeRows = (enrollmentRows ?? []) as UserTrainingRow[];
  const curriculumMap = await fetchCurrentCurriculumIdsForUsers(
    supabase,
    traineeUserIds
  );
  const representativeEnrollments = pickOneEnrollmentPerTrainee(
    activeRows,
    curriculumMap
  );
  const enrolledUserIds = new Set(representativeEnrollments.map((r) => r.user_id));

  const now = new Date();
  const targetHours = 5200; // Program target hours

  // Enrolled students: full progress cards.
  const enrolledCards = await Promise.all(
    representativeEnrollments.map(async (student): Promise<AssignedStudent> => {
      const { data: profile } = await supabase
        .from("users")
        .select("id, email, full_name, avatar_url")
        .eq("id", student.user_id)
        .single();

      const { data: logbookEntries } = await supabase
        .from("logbook_entries")
        .select("*")
        .eq("user_id", student.user_id);

      const totalHours =
        logbookEntries?.reduce(
          (sum, entry) => sum + Number(entry.hours_worked || 0),
          0
        ) || 0;

      const pendingEntries =
        logbookEntries?.filter((e) => e.status === "submitted").length || 0;

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

      if (hoursProgress < expectedProgress - 10) {
        progressStatus = "behind_pace";
      } else if (hoursProgress > expectedProgress + 10) {
        progressStatus = "ahead";
      }

      const { hoursCompleted, hoursRequired, trainingProgressPercent } =
        await getEnrollmentLessonSnapshot(supabase, student.id, student);

      return {
        ...student,
        id: student.id,
        userId: student.user_id,
        enrollmentId: student.id,
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

  // Students with no active enrollment yet: minimal cards so the mentor still
  // sees their full roster.
  const unenrolledUserIds = traineeUserIds.filter(
    (id) => !enrolledUserIds.has(id)
  );
  let unenrolledCards: AssignedStudent[] = [];
  if (unenrolledUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("users")
      .select("id, email, full_name, avatar_url")
      .in("id", unenrolledUserIds);

    unenrolledCards = (profiles ?? []).map((profile) => ({
      id: profile.id,
      user_id: profile.id,
      userId: profile.id,
      enrollmentId: null,
      start_date: "",
      status: "unenrolled",
      users: profile,
    }));
  }

  return {
    mentees: [...enrolledCards, ...unenrolledCards],
  };
}

export default async function MenteeListPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { add } = await searchParams;
  const [data, orgCtx, activeUser] = await Promise.all([
    getMentees(user.id),
    getActiveOrgDashboardContext(),
    getActiveUser(),
  ]);

  const canReassign =
    (activeUser != null && hasPlatformAdminAccess(activeUser.role)) ||
    (orgCtx != null &&
      hasOrganizationRolePermission(orgCtx.organizationRole, "supervisor"));

  return (
    <DashboardPageShell>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">My Students</h1>
          <p className="text-base text-muted-foreground">
            View and manage all your assigned students.
          </p>
        </div>
        <AddStudentButton
          mentorId={user.id}
          organizationId={orgCtx?.organizationId ?? null}
          canReassign={canReassign}
          initialOpen={add === "1"}
        />
      </div>

      <DashboardContentFrame>
        <AssignedStudentsList students={data.mentees} enableUnassign />
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}
