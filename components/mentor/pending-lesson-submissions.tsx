"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
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
  DialogFooter,
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
  approveLessonSubmissions,
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
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCheckedIds, setBulkCheckedIds] = useState<Set<string>>(() => new Set());
  const [bulkFeedback, setBulkFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);
  const [isBulkApproving, startBulkTransition] = useTransition();

  // Open detail modal when arriving from a notification deep link.
  useEffect(() => {
    if (initialOpenSubmissionId && submissions.length > 0) {
      const match = submissions.find((s) => s.id === initialOpenSubmissionId);
      if (match) {
        setSelected(match);
      }
    }
  }, [initialOpenSubmissionId, submissions]);

  const pendingSubmissions = useMemo(
    () => submissions.filter((submission) => submission.status === "submitted"),
    [submissions]
  );
  const pendingCount = pendingSubmissions.length;

  const bulkRows = useMemo(() => {
    return [...pendingSubmissions].sort((a, b) => {
      const byName = a.student_name.localeCompare(b.student_name);
      if (byName !== 0) return byName;
      return (a.week_number ?? 0) - (b.week_number ?? 0);
    });
  }, [pendingSubmissions]);

  const bulkSelectedCount = useMemo(
    () => bulkRows.filter((row) => bulkCheckedIds.has(row.id)).length,
    [bulkRows, bulkCheckedIds]
  );
  const allBulkChecked = bulkRows.length > 0 && bulkSelectedCount === bulkRows.length;

  function openBulkReview() {
    setBulkCheckedIds(new Set(bulkRows.map((row) => row.id)));
    setBulkFeedback(null);
    setBulkOpen(true);
  }

  function toggleBulkRow(id: string) {
    setBulkCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllBulkRows() {
    setBulkCheckedIds((prev) => {
      if (bulkRows.length > 0 && bulkRows.every((row) => prev.has(row.id))) {
        return new Set();
      }
      return new Set(bulkRows.map((row) => row.id));
    });
  }

  function approveSelected() {
    const ids = bulkRows.filter((row) => bulkCheckedIds.has(row.id)).map((row) => row.id);
    if (ids.length === 0) return;
    setBulkFeedback(null);
    startBulkTransition(async () => {
      const result = await approveLessonSubmissions(ids);
      if ("error" in result && result.error && !result.approvedCount) {
        setBulkFeedback({ type: "error", message: result.error });
        return;
      }
      setBulkOpen(false);
      if ("warning" in result && result.warning) {
        setBulkFeedback({ type: "warning", message: result.warning });
      } else if (result.approvedCount) {
        setBulkFeedback({
          type: "success",
          message: `Approved ${result.approvedCount} reflection${result.approvedCount === 1 ? "" : "s"}.`,
        });
      }
      router.refresh();
    });
  }

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
        <div className="flex flex-col gap-3 rounded-md border border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium text-foreground">
            {pendingCount} weekly submission{pendingCount === 1 ? "" : "s"}{" "}
            awaiting your review
          </p>
          <Button type="button" size="lg" className="shrink-0 gap-2" onClick={openBulkReview}>
            <CheckCircle2 className="h-4 w-4" />
            Review all
          </Button>
        </div>
      )}

      <Dialog
        open={bulkOpen}
        onOpenChange={(open) => {
          setBulkOpen(open);
          if (open) setBulkCheckedIds(new Set(bulkRows.map((row) => row.id)));
        }}
      >
        <DialogContent className="flex max-h-[min(90vh,760px)] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review pending reflections</DialogTitle>
            <DialogDescription>
              {pendingCount} reflection{pendingCount === 1 ? "" : "s"} listed below. All are
              selected by default; uncheck any you do not want to approve.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 px-1 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={allBulkChecked}
              onChange={toggleAllBulkRows}
              aria-label="Select all reflections"
              disabled={bulkRows.length === 0 || isBulkApproving}
            />
            <span className="text-muted-foreground">Select all</span>
          </div>
          <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {bulkRows.map((row) => (
              <li key={row.id} className="flex gap-3 rounded-md px-3 py-3 ring-1 ring-black/[0.04]">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-input accent-primary"
                  checked={bulkCheckedIds.has(row.id)}
                  onChange={() => toggleBulkRow(row.id)}
                  aria-label={`Approve ${row.student_name}'s reflection`}
                  disabled={isBulkApproving}
                />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">
                    {row.student_name}
                    {row.lesson_title ? ` · ${row.lesson_title}` : ""}
                    {row.week_number != null ? ` · Week ${row.week_number}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {row.reflection_text || "No reflection provided."}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="secondary"
              disabled={isBulkApproving}
              onClick={() => setBulkOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="gap-2"
              disabled={isBulkApproving || bulkSelectedCount === 0}
              onClick={approveSelected}
            >
              {isBulkApproving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Approving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Approve {bulkSelectedCount}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bulkFeedback ? (
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            bulkFeedback.type === "error" &&
              "border-destructive/30 bg-destructive/10 text-destructive",
            bulkFeedback.type === "warning" &&
              "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-100",
            bulkFeedback.type === "success" &&
              "border-emerald-500/25 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100"
          )}
          role="status"
        >
          {bulkFeedback.message}
        </p>
      ) : null}

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
