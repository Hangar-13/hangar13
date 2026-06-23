"use client";

import { useState } from "react";
import Link from "next/link";
import { User, Mail, Calendar, Clock, Target, CheckCircle, AlertCircle, TrendingUp, UserMinus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { unassignStudentMentorAction } from "@/app/actions/assign-student-mentor";

export interface AssignedStudent {
  /** Stable list key: representative enrollment id when enrolled, else the user id. */
  id: string;
  user_id: string;
  /** The student's user id (always set). */
  userId: string;
  /** Representative active enrollment id, or null when the student isn't enrolled yet. */
  enrollmentId: string | null;
  start_date: string;
  status: string;
  users: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  progress?: {
    overall: number;
    hoursCompleted: number;
    hoursRequired: number;
  };
  hours?: {
    total: number;
    target: number;
    progress: number;
  };
  weeks?: {
    current: number;
  };
  progressStatus?: "on_track" | "behind_pace" | "ahead";
  pendingEntries?: number;
}

interface AssignedStudentsListProps {
  students: AssignedStudent[];
  /** Compact layout for dashboard overview */
  compact?: boolean;
  /** Show a "Remove me as mentor" action on each student (My Students page). */
  enableUnassign?: boolean;
  /** When the list is empty, show an "Add students" button linking here. */
  addStudentsHref?: string;
}

export function AssignedStudentsList({
  students,
  compact = false,
  enableUnassign = false,
  addStudentsHref,
}: AssignedStudentsListProps) {
  const router = useRouter();
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const handleCardClick = (enrollmentId: string | null) => {
    if (!enrollmentId) return;
    router.push(`/dashboard/mentor/student/${enrollmentId}`);
  };

  const handleUnassign = async (
    e: React.MouseEvent,
    userId: string,
    name: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (
      !window.confirm(
        `Remove yourself as ${name}'s mentor? They'll have no mentor until someone is assigned.`
      )
    ) {
      return;
    }
    setRemovingUserId(userId);
    try {
      const res = await unassignStudentMentorAction({ studentUserId: userId });
      if (res.error) {
        window.alert(res.error);
        return;
      }
      router.refresh();
    } finally {
      setRemovingUserId(null);
    }
  };

  const handlePendingEntriesClick = (e: React.MouseEvent, studentName?: string | null, studentEmail?: string) => {
    e.stopPropagation();
    e.preventDefault();
    const name = studentName || studentEmail || "";
    router.push(`/dashboard/mentor/review-logs?student=${encodeURIComponent(name)}`);
  };

  const getStatusBadge = (progressStatus?: "on_track" | "behind_pace" | "ahead", small?: boolean) => {
    const sizeClass = small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";
    const iconSize = small ? "h-2.5 w-2.5" : "h-3 w-3";
    switch (progressStatus) {
      case "on_track":
        return (
          <span className={`${sizeClass} rounded-full bg-green-500/10 text-green-600 font-medium flex items-center gap-1`}>
            <CheckCircle className={iconSize} />
            On Track
          </span>
        );
      case "behind_pace":
        return (
          <span className={`${sizeClass} rounded-full bg-red-500/10 text-red-600 font-medium flex items-center gap-1`}>
            <AlertCircle className={iconSize} />
            Behind
          </span>
        );
      case "ahead":
        return (
          <span className={`${sizeClass} rounded-full bg-blue-500/10 text-blue-600 font-medium flex items-center gap-1`}>
            <TrendingUp className={iconSize} />
            Ahead
          </span>
        );
      default:
        return null;
    }
  };

  if (students.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">No assigned students yet.</p>
        {addStudentsHref && (
          <Link href={addStudentsHref}>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add students
            </Button>
          </Link>
        )}
      </div>
    );
  }

  const rowBase = cn(
    "cursor-pointer transition-colors",
    compact
      ? "flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-muted/40"
      : "px-1 py-5 first:pt-0 last:pb-0 hover:bg-muted/25 sm:px-2"
  );

  if (compact) {
    return (
      <div className="divide-y divide-border/50 rounded-md ring-1 ring-black/[0.04]">
        {students.map((student) => (
          <div
            key={student.id}
            className={cn(
              "px-3 py-2.5 transition-colors",
              student.enrollmentId
                ? "cursor-pointer hover:bg-muted/40"
                : "cursor-default"
            )}
            onClick={() => handleCardClick(student.enrollmentId)}
          >
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                {student.users?.avatar_url ? (
                  <img
                    src={student.users.avatar_url}
                    alt={student.users.full_name || "Student"}
                    className="h-8 w-8 rounded-full"
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h4 className="truncate text-sm font-medium">
                  {student.users?.full_name || "Unnamed Student"}
                </h4>
                {student.enrollmentId
                  ? getStatusBadge(student.progressStatus, true)
                  : (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Not enrolled
                    </span>
                  )}
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                {student.progress && (
                  <span title="Training hours progress">{student.progress.overall}%</span>
                )}
                {student.hours && <span title="Hours">{student.hours.total.toFixed(0)}h</span>}
                {student.pendingEntries !== undefined && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs hover:bg-primary/10"
                    onClick={(e) =>
                      handlePendingEntriesClick(e, student.users?.full_name, student.users?.email)
                    }
                  >
                    <Target className="mr-1 h-3 w-3" />
                    {student.pendingEntries}
                  </Button>
                )}
              </div>
            </div>
            {student.progress && (
              <div className="mt-2 h-1 w-full rounded-full bg-secondary">
                <div
                  className="h-1 rounded-full bg-primary transition-all"
                  style={{ width: `${student.progress.overall}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {students.map((student) => (
        <div
          key={student.id}
          className={cn(rowBase, !student.enrollmentId && "cursor-default hover:bg-transparent")}
          onClick={() => handleCardClick(student.enrollmentId)}
        >
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0">
                {student.users?.avatar_url ? (
                  <img
                    src={student.users.avatar_url}
                    alt={student.users.full_name || "Student"}
                    className="h-12 w-12 rounded-full"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-lg font-semibold">
                  {student.users?.full_name || "Unnamed Student"}
                </h4>
                <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{student.users?.email}</span>
                </div>
              </div>
              {enableUnassign && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={removingUserId === student.userId}
                  onClick={(e) =>
                    handleUnassign(
                      e,
                      student.userId,
                      student.users?.full_name || "this student"
                    )
                  }
                >
                  <UserMinus className="mr-2 h-4 w-4" />
                  {removingUserId === student.userId ? "Removing..." : "Remove me"}
                </Button>
              )}
            </div>

            {student.enrollmentId ? (
              getStatusBadge(student.progressStatus)
            ) : (
              <span className="inline-block rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                Not enrolled in any training yet
              </span>
            )}

            <div className="space-y-3 border-t border-border/40 pt-3">
              {student.progress && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Training progress</span>
                    <span className="font-semibold">{student.progress.overall}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${student.progress.overall}%` }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {student.progress.hoursRequired > 0
                      ? `${student.progress.hoursCompleted.toFixed(1)} / ${student.progress.hoursRequired.toFixed(1)} training hours`
                      : "No training hours defined for this program"}
                  </div>
                </div>
              )}

              {student.weeks && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Current Week
                  </span>
                  <span className="font-semibold">Week {student.weeks.current}</span>
                </div>
              )}

              {student.hours && (
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      Hours Progress
                    </span>
                    <span className="font-semibold">
                      {student.hours.total.toFixed(1)} / {student.hours.target}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-secondary">
                    <div
                      className="h-2 rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(student.hours.progress, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {student.pendingEntries !== undefined && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-between hover:bg-primary/10"
                  onClick={(e) =>
                    handlePendingEntriesClick(e, student.users?.full_name, student.users?.email)
                  }
                >
                  <span className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Target className="h-3 w-3" />
                    Pending Logbook Entries
                  </span>
                  <span
                    className={`text-sm font-semibold ${student.pendingEntries > 0 ? "text-primary" : ""}`}
                  >
                    {student.pendingEntries}
                  </span>
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
