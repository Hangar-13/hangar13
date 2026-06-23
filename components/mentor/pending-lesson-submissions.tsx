"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Calendar,
  User,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { formatUiDate } from "@/lib/format-ui-date";
import {
  approveLessonSubmission,
  rejectLessonSubmission,
} from "@/app/actions/lesson-submission-approval";

export interface PendingLessonSubmissionFile {
  id: string;
  file_url: string;
  file_name: string;
  file_type: string | null;
}

export interface PendingLessonSubmission {
  id: string;
  user_training_id: string;
  week_number: number | null;
  reflection_text: string | null;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  reject_reason: string | null;
  mentor_notes: string | null;
  lesson_title: string | null;
  student_name: string;
  student_email: string | null;
  files: PendingLessonSubmissionFile[];
}

interface PendingLessonSubmissionsProps {
  submissions: PendingLessonSubmission[];
  initialNameFilter?: string;
  initialOpenSubmissionId?: string;
}

function getStatusDisplay(status: string) {
  switch (status) {
    case "submitted":
      return {
        label: "Awaiting review",
        color:
          "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
      };
    case "approved":
      return {
        label: "Approved",
        color:
          "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      };
    case "rejected":
      return {
        label: "Rejected",
        color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
      };
    default:
      return { label: "Draft", color: "bg-muted text-muted-foreground" };
  }
}

export function PendingLessonSubmissions({
  submissions,
  initialNameFilter = "",
  initialOpenSubmissionId,
}: PendingLessonSubmissionsProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<PendingLessonSubmission | null>(
    null
  );
  const [statusFilter, setStatusFilter] = useState<
    "pending" | "approved" | "rejected" | "all"
  >("pending");
  const [nameFilter, setNameFilter] = useState<string>(initialNameFilter);

  const [reviewMode, setReviewMode] = useState<"approve" | "reject" | null>(
    null
  );
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Open detail modal when arriving from a notification deep link.
  useEffect(() => {
    if (initialOpenSubmissionId && submissions.length > 0) {
      const match = submissions.find((s) => s.id === initialOpenSubmissionId);
      if (match) {
        setSelected(match);
      }
    }
  }, [initialOpenSubmissionId, submissions]);

  const pendingCount = useMemo(
    () => submissions.filter((s) => s.status === "submitted").length,
    [submissions]
  );

  const filteredSubmissions = useMemo(() => {
    return submissions.filter((submission) => {
      if (statusFilter === "pending" && submission.status !== "submitted") {
        return false;
      }
      if (statusFilter === "approved" && submission.status !== "approved") {
        return false;
      }
      if (statusFilter === "rejected" && submission.status !== "rejected") {
        return false;
      }

      if (nameFilter.trim()) {
        const haystack = `${submission.student_name} ${
          submission.student_email ?? ""
        }`.toLowerCase();
        if (!haystack.includes(nameFilter.toLowerCase().trim())) {
          return false;
        }
      }

      return true;
    });
  }, [submissions, statusFilter, nameFilter]);

  const openReview = (mode: "approve" | "reject") => {
    setError(null);
    setFeedbackText("");
    setReviewMode(mode);
  };

  const closeDetail = () => {
    setSelected(null);
    setReviewMode(null);
    setFeedbackText("");
    setError(null);
  };

  const handleConfirmReview = async () => {
    if (!selected || !reviewMode) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const result =
        reviewMode === "approve"
          ? await approveLessonSubmission(selected.id, feedbackText)
          : await rejectLessonSubmission(selected.id, feedbackText);

      if ("success" in result && result.success) {
        closeDetail();
        router.refresh();
      } else {
        setError(
          ("error" in result && result.error) || "Something went wrong."
        );
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {pendingCount > 0 && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3">
          <p className="font-medium text-foreground">
            {pendingCount} weekly submission{pendingCount === 1 ? "" : "s"}{" "}
            awaiting your review
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter" className="text-sm whitespace-nowrap">
            Status
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(value: "pending" | "approved" | "rejected" | "all") =>
              setStatusFilter(value)
            }
          >
            <SelectTrigger id="status-filter" className="w-[150px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Awaiting review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Label htmlFor="name-filter" className="text-sm whitespace-nowrap">
            Name
          </Label>
          <Input
            id="name-filter"
            type="text"
            placeholder="Search by name..."
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            className="flex-1"
          />
        </div>
      </div>

      {/* Submissions list */}
      <div className="space-y-4">
        {filteredSubmissions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No submissions found matching the filters.
          </p>
        ) : (
          filteredSubmissions.map((submission) => {
            const statusDisplay = getStatusDisplay(submission.status);
            return (
              <div
                key={submission.id}
                className={cn(
                  "cursor-pointer space-y-3 rounded-md bg-muted/15 px-4 py-3 ring-1 ring-black/[0.04] transition-colors",
                  "hover:bg-muted/30"
                )}
                onClick={() => {
                  setReviewMode(null);
                  setError(null);
                  setSelected(submission);
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {submission.student_name}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center text-xs px-2 py-1 rounded-full font-medium",
                        statusDisplay.color
                      )}
                    >
                      {statusDisplay.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {submission.week_number != null && (
                      <span className="font-medium">
                        Week {submission.week_number}
                      </span>
                    )}
                    {submission.submitted_at && (
                      <>
                        <Calendar className="h-3 w-3 ml-2" />
                        <span>{formatUiDate(submission.submitted_at)}</span>
                      </>
                    )}
                  </div>
                </div>

                {submission.lesson_title && (
                  <p className="text-sm font-medium">{submission.lesson_title}</p>
                )}

                <p className="text-sm text-muted-foreground line-clamp-2">
                  {submission.reflection_text || "No reflection provided."}
                </p>

                {submission.files.length > 0 && (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <FileText className="h-3 w-3" />
                    {submission.files.length} attached file
                    {submission.files.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Detail + review modal */}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,760px)] flex-col sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {selected.student_name}
                  <span
                    className={cn(
                      "inline-flex items-center text-xs px-2 py-1 rounded-full font-medium",
                      getStatusDisplay(selected.status).color
                    )}
                  >
                    {getStatusDisplay(selected.status).label}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {selected.week_number != null
                    ? `Week ${selected.week_number}`
                    : "Weekly submission"}
                  {selected.lesson_title ? ` · ${selected.lesson_title}` : ""}
                  {selected.submitted_at
                    ? ` · Submitted ${formatUiDate(selected.submitted_at)}`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Reflection
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">
                    {selected.reflection_text || "No reflection provided."}
                  </p>
                </div>

                {selected.files.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Attached files
                    </p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {selected.files.map((file) => (
                        <a
                          key={file.id}
                          href={file.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group block overflow-hidden rounded-md transition-opacity hover:opacity-90"
                        >
                          {file.file_type?.startsWith("image/") ? (
                            <div className="aspect-square">
                              <img
                                src={file.file_url}
                                alt={file.file_name}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="flex aspect-square flex-col items-center justify-center bg-muted/30 p-4 transition-colors group-hover:bg-muted/50">
                              <FileText className="mb-2 h-7 w-7 text-muted-foreground" />
                              <p className="w-full truncate text-center text-xs text-muted-foreground">
                                {file.file_name}
                              </p>
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {selected.status === "approved" && selected.mentor_notes && (
                  <div className="rounded-md border border-green-500/25 bg-green-500/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-green-700 dark:text-green-300">
                      Your approval notes
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {selected.mentor_notes}
                    </p>
                  </div>
                )}

                {selected.status === "rejected" && selected.reject_reason && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
                      Rejection feedback sent to student
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">
                      {selected.reject_reason}
                    </p>
                  </div>
                )}

                {reviewMode && (
                  <div className="space-y-2 border-t pt-4">
                    <Label htmlFor="review-feedback">
                      {reviewMode === "approve"
                        ? "Approval notes (optional)"
                        : "Rejection reason"}
                    </Label>
                    <Textarea
                      id="review-feedback"
                      rows={4}
                      className="resize-none"
                      placeholder={
                        reviewMode === "approve"
                          ? "Add any feedback for the student (optional)..."
                          : "Explain what the student needs to revise..."
                      }
                      value={feedbackText}
                      onChange={(e) => setFeedbackText(e.target.value)}
                    />
                    {reviewMode === "reject" && (
                      <p className="text-xs text-muted-foreground">
                        The student will see this feedback and can edit and
                        resubmit their week.
                      </p>
                    )}
                  </div>
                )}

                {error && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                {reviewMode ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => {
                        setReviewMode(null);
                        setFeedbackText("");
                        setError(null);
                      }}
                    >
                      Back
                    </Button>
                    <Button
                      type="button"
                      variant={reviewMode === "reject" ? "destructive" : "default"}
                      disabled={isSubmitting}
                      onClick={handleConfirmReview}
                      className="gap-2"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : reviewMode === "approve" ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      {reviewMode === "approve"
                        ? isSubmitting
                          ? "Approving..."
                          : "Confirm approval"
                        : isSubmitting
                          ? "Rejecting..."
                          : "Confirm rejection"}
                    </Button>
                  </>
                ) : selected.status === "submitted" ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => openReview("reject")}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      type="button"
                      className="gap-2"
                      onClick={() => openReview("approve")}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                  </>
                ) : (
                  <Button type="button" variant="outline" onClick={closeDetail}>
                    Close
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
