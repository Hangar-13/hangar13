"use client";

import { Card, CardContent } from "@/components/ui/card";
import { User, Mail, Calendar, Clock, Target, CheckCircle, AlertCircle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface AssignedStudent {
  id: string;
  user_id: string;
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
}

export function AssignedStudentsList({
  students,
  compact = false,
}: AssignedStudentsListProps) {
  const router = useRouter();
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handleCardClick = (studentId: string) => {
    router.push(`/dashboard/mentor/student/${studentId}`);
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
      <p className="text-sm text-muted-foreground text-center py-8">
        No assigned students yet.
      </p>
    );
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2">
        {students.map((student) => (
          <Card
            key={student.id}
            className="bg-card border transition-all hover:shadow-md hover:border-primary/50 cursor-pointer"
            onClick={() => handleCardClick(student.id)}
          >
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0">
                  {student.users?.avatar_url ? (
                    <img
                      src={student.users.avatar_url}
                      alt={student.users.full_name || "Student"}
                      className="h-8 w-8 rounded-full"
                    />
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>
                {/* Name + Status */}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <h4 className="font-medium text-sm truncate">
                    {student.users?.full_name || "Unnamed Student"}
                  </h4>
                  {getStatusBadge(student.progressStatus, true)}
                </div>
                {/* Compact stats */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-shrink-0">
                  {student.progress && (
                    <span title="Training hours progress">
                      {student.progress.overall}%
                    </span>
                  )}
                  {student.hours && (
                    <span title="Hours">{student.hours.total.toFixed(0)}h</span>
                  )}
                  {student.pendingEntries !== undefined && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs hover:bg-primary/10"
                      onClick={(e) => handlePendingEntriesClick(e, student.users?.full_name, student.users?.email)}
                    >
                      <Target className="h-3 w-3 mr-1" />
                      {student.pendingEntries}
                    </Button>
                  )}
                </div>
              </div>
              {/* Thin progress bar */}
              {student.progress && (
                <div className="mt-2">
                  <div className="w-full bg-secondary rounded-full h-1">
                    <div
                      className="bg-primary rounded-full h-1 transition-all"
                      style={{ width: `${student.progress.overall}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {students.map((student) => (
        <Card
          key={student.id}
          className="bg-card border-2 transition-all hover:shadow-lg hover:border-primary/50 cursor-pointer h-full"
          onClick={() => handleCardClick(student.id)}
        >
          <CardContent className="pt-6">
            <div className="space-y-4">
                {/* Header with Avatar and Name */}
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    {student.users?.avatar_url ? (
                      <img
                        src={student.users.avatar_url}
                        alt={student.users.full_name || "Student"}
                        className="h-12 w-12 rounded-full"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <User className="h-6 w-6 text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-lg truncate">
                      {student.users?.full_name || "Unnamed Student"}
                    </h4>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{student.users?.email}</span>
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                {getStatusBadge(student.progressStatus)}

                {/* Progress Stats */}
                <div className="space-y-3 pt-2 border-t border-border">
                  {/* Overall Progress */}
                  {student.progress && (
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Training progress</span>
                        <span className="font-semibold">{student.progress.overall}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2 transition-all"
                          style={{ width: `${student.progress.overall}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {student.progress.hoursRequired > 0
                          ? `${student.progress.hoursCompleted.toFixed(1)} / ${student.progress.hoursRequired.toFixed(1)} training hours`
                          : "No training hours defined for this program"}
                      </div>
                    </div>
                  )}

                  {/* Current Week */}
                  {student.weeks && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Current Week
                      </span>
                      <span className="font-semibold">Week {student.weeks.current}</span>
                    </div>
                  )}

                  {/* Hours Progress */}
                  {student.hours && (
                    <div>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Hours Progress
                        </span>
                        <span className="font-semibold">
                          {student.hours.total.toFixed(1)} / {student.hours.target}
                        </span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className="bg-primary rounded-full h-2 transition-all"
                          style={{ width: `${Math.min(student.hours.progress, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Pending Entries */}
                  {student.pendingEntries !== undefined && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between hover:bg-primary/10"
                      onClick={(e) => handlePendingEntriesClick(e, student.users?.full_name, student.users?.email)}
                    >
                      <span className="text-muted-foreground flex items-center gap-1 text-sm">
                        <Target className="h-3 w-3" />
                        Pending Logbook Entries
                      </span>
                      <span className={`font-semibold text-sm ${student.pendingEntries > 0 ? "text-primary" : ""}`}>
                        {student.pendingEntries}
                      </span>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
      ))}
    </div>
  );
}