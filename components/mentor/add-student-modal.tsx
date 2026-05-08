"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-browser";
import { User, Mail, Clock, Plus } from "lucide-react";
import { assignEnrollmentMentorAction } from "@/app/actions/assign-enrollment-mentor";

interface Student {
  id: string;
  user_id: string;
  profile_mentor_id: string | null;
  full_name: string;
  email: string;
  total_hours: number;
  is_assigned: boolean;
}

interface AddStudentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMentorId: string;
  /** Scope candidates to an org (program ownership + org student role). */
  organizationId?: string | null;
  onSuccess?: () => void;
}

export function AddStudentModal({
  open,
  onOpenChange,
  currentMentorId,
  organizationId = null,
  onSuccess,
}: AddStudentModalProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      void fetchStudents();
    }
  }, [open, currentMentorId, organizationId]);

  async function fetchStudents() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      let query = supabase
        .from("user_trainings")
        .select("id, user_id, mentor_id, status, training_paths(organization_id)")
        .eq("status", "active");

      const { data: rawRows, error: studentsError } = await query;

      const allStudents =
        organizationId && rawRows
          ? rawRows.filter((r) => {
              const tp = r.training_paths;
              const org =
                Array.isArray(tp) && tp[0]
                  ? (tp[0] as { organization_id: string }).organization_id
                  : tp &&
                      typeof tp === "object" &&
                      "organization_id" in tp
                    ? (tp as { organization_id: string }).organization_id
                    : null;
              return org === organizationId;
            })
          : rawRows;

      if (studentsError) {
        console.error("Error fetching students:", studentsError);
        setError(
          `Failed to load students: ${studentsError.message}. Make sure the RLS policy allows mentors to view enrollments.`
        );
        setLoading(false);
        return;
      }

      const enrollmentRows = allStudents ?? [];
      const enrollmentUserIds = [
        ...new Set(enrollmentRows.map((r) => r.user_id as string)),
      ];

      let orgStudentIds = new Set<string>(enrollmentUserIds);
      let userIdsWithStudentRole = new Set<string>();

      if (organizationId && enrollmentUserIds.length > 0) {
        const { data: memRows, error: memErr } = await supabase
          .from("user_organizations")
          .select("user_id, role")
          .in("user_id", enrollmentUserIds)
          .eq("organization_id", organizationId);

        if (memErr) {
          console.error("Error fetching memberships:", memErr);
          setError(`Failed to load organization memberships: ${memErr.message}`);
          setLoading(false);
          return;
        }

        orgStudentIds = new Set(
          (memRows ?? [])
            .filter((m) => m.role === "student")
            .map((m) => m.user_id as string)
        );
        userIdsWithStudentRole = orgStudentIds;
      } else if (enrollmentUserIds.length > 0) {
        const { data: sm, error: smErr } = await supabase
          .from("user_organizations")
          .select("user_id")
          .in("user_id", enrollmentUserIds)
          .eq("role", "student");

        if (smErr) {
          console.error("Error fetching student memberships:", smErr);
          setError(`Failed to load student roles: ${smErr.message}`);
          setLoading(false);
          return;
        }
        userIdsWithStudentRole = new Set((sm ?? []).map((m) => m.user_id as string));
      }

      const studentsWithDetails = await Promise.all(
        enrollmentRows.map(async (student) => {
          if (student.user_id === currentMentorId) {
            return null;
          }

          if (!organizationId && !userIdsWithStudentRole.has(student.user_id as string)) {
            return null;
          }

          if (organizationId && !orgStudentIds.has(student.user_id as string)) {
            return null;
          }

          const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("id, email, full_name, role, mentor_id")
            .eq("id", student.user_id)
            .single();

          if (profileError) {
            console.error(`Error fetching profile for student ${student.id}:`, profileError);
            return null;
          }

          if (profile?.role === "admin" || profile?.role === "god") {
            return null;
          }

          const { data: entries, error: entriesError } = await supabase
            .from("logbook_entries")
            .select("hours_worked")
            .eq("user_id", student.user_id as string);

          if (entriesError) {
            console.error(`Error fetching entries for student ${student.id}:`, entriesError);
          }

          const totalHours =
            entries?.reduce(
              (sum, entry) =>
                sum + (parseFloat(entry.hours_worked?.toString() || "0") || 0),
              0
            ) || 0;

          const profileMentorId = (profile?.mentor_id as string | null) ?? null;
          const isAssigned = profileMentorId === currentMentorId;

          return {
            id: student.id as string,
            user_id: student.user_id as string,
            profile_mentor_id: profileMentorId,
            full_name: profile.full_name || "Unknown",
            email: profile.email || "",
            total_hours: totalHours,
            is_assigned: isAssigned,
          };
        })
      );

      const validStudents = studentsWithDetails.filter((a): a is Student => a !== null);
      setStudents(validStudents);
    } catch (err) {
      console.error("Error fetching students:", err);
      setError("Failed to load students. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function assignStudent(enrollmentId: string) {
    setAssigning(enrollmentId);
    setError(null);

    try {
      const res = await assignEnrollmentMentorAction({
        userTrainingId: enrollmentId,
        mentorUserId: currentMentorId,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      setStudents((prev) =>
        prev.map((a) =>
          a.id === enrollmentId
            ? {
                ...a,
                profile_mentor_id: currentMentorId,
                is_assigned: true,
              }
            : a
        )
      );

      onSuccess?.();
    } catch (err) {
      console.error("Error assigning student:", err);
      setError("Failed to assign student. Please try again.");
    } finally {
      setAssigning(null);
    }
  }

  const unassignedStudents = students.filter((a) => !a.is_assigned);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
          <DialogDescription>
            Assign yourself as this learner’s mentor. They can only have one mentor; that mentor
            receives logbook and lesson submission notifications and is the only role that can
            sign off their work (aside from platform administrators).
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Loading students...</p>
            </div>
          ) : students.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                {organizationId
                  ? "No eligible learners found for this organization."
                  : "No students found in the system."}
              </p>
            </div>
          ) : unassignedStudents.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                Everyone shown here already has you as their mentor. If someone is missing, change
                the active organization (top of the app) or ask an administrator to confirm their
                enrollment and org role.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {unassignedStudents.map((student) => (
                <div
                  key={student.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{student.full_name}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate">{student.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{student.total_hours.toFixed(1)} hours</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => assignStudent(student.id)}
                    disabled={assigning === student.id || student.is_assigned}
                  >
                    {assigning === student.id ? (
                      "Assigning..."
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
