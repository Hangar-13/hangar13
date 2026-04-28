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

interface Student {
  id: string;
  user_id: string;
  mentor_id: string | null;
  full_name: string;
  email: string;
  total_hours: number;
  is_assigned: boolean;
}

interface AddStudentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMentorId: string;
  onSuccess?: () => void;
}

export function AddStudentModal({
  open,
  onOpenChange,
  currentMentorId,
  onSuccess,
}: AddStudentModalProps) {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchStudents();
    }
  }, [open, currentMentorId]);

  async function fetchStudents() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // Get all students with their profiles
      // Note: This requires RLS policy that allows mentors to view all students
      const { data: allStudents, error: studentsError } = await supabase
        .from("user_trainings")
        .select("id, user_id, mentor_id, status")
        .eq("status", "active");

      if (studentsError) {
        console.error("Error fetching students:", studentsError);
        setError(`Failed to load students: ${studentsError.message}. Make sure the RLS policy allows mentors to view all students.`);
        setLoading(false);
        return;
      }

      // Get profiles and calculate hours for each student
      // Filter to only include students (role='student'), not mentors/managers or the current mentor
      const studentsWithDetails = await Promise.all(
        (allStudents || []).map(async (student) => {
          // Skip if it's the current mentor
          if (student.user_id === currentMentorId) {
            return null;
          }

          // Get profile with role check
          const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("id, email, full_name, role")
            .eq("id", student.user_id)
            .single();

          if (profileError) {
            console.error(`Error fetching profile for student ${student.id}:`, profileError);
            return null; // Skip this student if profile fetch fails
          }

          // Only include users with role='student', exclude mentors, managers, etc.
          if (profile?.role !== 'student') {
            return null;
          }

          // Get total hours from logbook entries
          // Note: This should work with the existing mentor RLS policy for logbook_entries
          const { data: entries, error: entriesError } = await supabase
            .from("logbook_entries")
            .select("hours_worked")
            .eq("user_training_id", student.id);

          if (entriesError) {
            console.error(`Error fetching entries for student ${student.id}:`, entriesError);
          }

          const totalHours = entries?.reduce(
            (sum, entry) => sum + (parseFloat(entry.hours_worked?.toString() || "0") || 0),
            0
          ) || 0;

          return {
            id: student.id,
            user_id: student.user_id,
            mentor_id: student.mentor_id,
            full_name: profile.full_name || "Unknown",
            email: profile.email || "",
            total_hours: totalHours,
            is_assigned: student.mentor_id === currentMentorId,
          };
        })
      );

      // Filter out null values (non-students or the current mentor)
      const validStudents = studentsWithDetails.filter((a): a is Student => a !== null);
      setStudents(validStudents);
    } catch (err) {
      console.error("Error fetching students:", err);
      setError("Failed to load students. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function assignStudent(studentId: string) {
    setAssigning(studentId);
    setError(null);

    try {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from("user_trainings")
        .update({ mentor_id: currentMentorId })
        .eq("id", studentId);

      if (updateError) throw updateError;

      // Update local state
      setStudents((prev) =>
        prev.map((a) =>
          a.id === studentId
            ? { ...a, mentor_id: currentMentorId, is_assigned: true }
            : a
        )
      );

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
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
            Select a student to assign to your mentoring list.
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
                No students found in the system.
              </p>
            </div>
          ) : unassignedStudents.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                No unassigned students available. All students are already assigned to mentors.
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
