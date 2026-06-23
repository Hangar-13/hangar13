"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-browser";
import { User, Mail, Plus, Check } from "lucide-react";
import { assignStudentMentorAction } from "@/app/actions/assign-student-mentor";

interface Candidate {
  user_id: string;
  full_name: string | null;
  email: string | null;
  mentor_id: string | null;
  mentor_name: string | null;
}

interface AddStudentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMentorId: string;
  /** Students are scoped to this organization's membership. */
  organizationId?: string | null;
  /** When true (supervisor/lead), the viewer may reassign students who already have a mentor. */
  canReassign?: boolean;
  onSuccess?: () => void;
}

export function AddStudentModal({
  open,
  onOpenChange,
  currentMentorId,
  organizationId = null,
  canReassign = false,
  onSuccess,
}: AddStudentModalProps) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!organizationId) {
      setCandidates([]);
      setLoading(false);
      setError(
        "Select an organization (top of the app) to see its students."
      );
      return;
    }

    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc(
        "list_org_student_candidates",
        { p_organization_id: organizationId }
      );

      if (rpcError) {
        console.error("Error fetching student candidates:", rpcError);
        setError(`Failed to load students: ${rpcError.message}`);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as Candidate[];
      // Exclude self and students this mentor already mentors — there's nothing
      // to add for those.
      const filtered = rows.filter(
        (r) => r.user_id !== currentMentorId && r.mentor_id !== currentMentorId
      );
      setCandidates(filtered);
    } catch (err) {
      console.error("Error fetching student candidates:", err);
      setError("Failed to load students. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, currentMentorId]);

  useEffect(() => {
    if (open) {
      void fetchCandidates();
    }
  }, [open, fetchCandidates]);

  async function assignStudent(studentUserId: string) {
    setAssigning(studentUserId);
    setError(null);

    try {
      const res = await assignStudentMentorAction({
        studentUserId,
        mentorUserId: currentMentorId,
      });

      if (res.error) {
        setError(res.error);
        return;
      }

      // Remove the now-assigned student from the candidate list.
      setCandidates((prev) => prev.filter((c) => c.user_id !== studentUserId));
      onSuccess?.();
    } catch (err) {
      console.error("Error assigning student:", err);
      setError("Failed to assign student. Please try again.");
    } finally {
      setAssigning(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Student</DialogTitle>
          <DialogDescription>
            Become this student&apos;s mentor across all of their training. Each student
            has a single mentor, who receives logbook and lesson submission notifications
            and signs off their work (aside from platform administrators).
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
          ) : candidates.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                No students available to add. Everyone in this organization either
                already has you as their mentor or there are no students yet.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.map((candidate) => {
                const hasOtherMentor =
                  candidate.mentor_id != null &&
                  candidate.mentor_id !== currentMentorId;
                return (
                  <div
                    key={candidate.user_id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <User className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {candidate.full_name || "Unnamed Student"}
                        </p>
                        <div className="flex items-center gap-4 mt-1">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            <span className="truncate">{candidate.email}</span>
                          </div>
                          {hasOtherMentor && (
                            <span className="text-xs text-amber-600">
                              Currently mentored by {candidate.mentor_name || "another mentor"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {hasOtherMentor && !canReassign ? (
                      <span className="text-xs text-muted-foreground shrink-0">
                        Has a mentor
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant={hasOtherMentor ? "outline" : "default"}
                        onClick={() => assignStudent(candidate.user_id)}
                        disabled={assigning === candidate.user_id}
                      >
                        {assigning === candidate.user_id ? (
                          "Assigning..."
                        ) : hasOtherMentor ? (
                          <>
                            <Check className="h-4 w-4 mr-2" />
                            Reassign to me
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Add
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
