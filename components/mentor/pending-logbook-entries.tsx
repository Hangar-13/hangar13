"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import { Calendar, Clock, User, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { approveLogbookEntry, approveAllPendingLogbookEntries, rejectLogbookEntry } from "@/app/actions/logbook-approval";
import { useRouter } from "next/navigation";
import { AddEntryModal } from "@/components/student/add-entry-modal";
import { RejectReasonDialog } from "@/components/mentor/reject-reason-dialog";
import { cn } from "@/lib/utils";
import { formatUiDate } from "@/lib/format-ui-date";

export interface PendingLogbookEntry {
  id: string;
  entry_date: string;
  hours_worked: number;
  description: string;
  skills_practiced: string[] | null;
  challenges_encountered: string | null;
  next_steps: string | null;
  status: string;
  reject_reason?: string | null;
  user_trainings: {
    id: string;
    users: {
      id: string;
      full_name: string | null;
      email: string;
    } | null;
  } | null;
}

export type AtaChapterOption = { value: string; label: string };

interface PendingLogbookEntriesProps {
  entries: PendingLogbookEntry[];
  acsCodesByEntry?: Record<string, string[]>;
  ataChapters: AtaChapterOption[];
  initialNameFilter?: string;
  initialOpenEntryId?: string;
}

export function PendingLogbookEntries({
  entries,
  acsCodesByEntry = {},
  ataChapters,
  initialNameFilter = "",
  initialOpenEntryId,
}: PendingLogbookEntriesProps) {
  const router = useRouter();
  const [isBulkApproving, startBulkTransition] = useTransition();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<PendingLogbookEntry | null>(null);
  const [rejectingEntryId, setRejectingEntryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"draft" | "pending" | "all">("pending");
  const [nameFilter, setNameFilter] = useState<string>(initialNameFilter);
  const [bulkReviewOpen, setBulkReviewOpen] = useState(false);
  const [bulkFeedback, setBulkFeedback] = useState<{
    type: "success" | "error" | "warning";
    message: string;
  } | null>(null);

  // Open modal for specific entry when navigating from notification.
  // Only open if entry is still pending (submitted) - don't re-open after approve/reject.
  useEffect(() => {
    if (initialOpenEntryId && entries.length > 0) {
      const entry = entries.find((e) => e.id === initialOpenEntryId);
      if (entry && entry.status === "submitted") {
        setSelectedEntry(entry);
      }
    }
  }, [initialOpenEntryId, entries]);

  const pendingSubmitted = useMemo(
    () => entries.filter((e) => e.status === "submitted"),
    [entries]
  );
  const pendingCount = pendingSubmitted.length;

  const bulkLinesSorted = useMemo(() => {
    return [...pendingSubmitted].sort((a, b) => {
      const an = (
        a.user_trainings?.users?.full_name ||
        a.user_trainings?.users?.email ||
        ""
      ).toLowerCase();
      const bn = (
        b.user_trainings?.users?.full_name ||
        b.user_trainings?.users?.email ||
        ""
      ).toLowerCase();
      if (an !== bn) return an.localeCompare(bn);
      return (b.entry_date || "").localeCompare(a.entry_date || "");
    });
  }, [pendingSubmitted]);

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "submitted":
        return { label: "Pending Signature", color: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300" };
      case "approved":
        return { label: "Signed", color: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" };
      case "rejected":
        return { label: "Rejected", color: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" };
      default:
        return { label: "Draft", color: "bg-muted text-muted-foreground" };
    }
  };

  // Filter entries based on status and name
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Filter by status
      if (statusFilter === "pending" && entry.status !== "submitted") {
        return false;
      }
      if (statusFilter === "draft" && entry.status !== "draft") {
        return false;
      }
      // "all" shows all entries regardless of status

      // Filter by student name
      if (nameFilter.trim()) {
        const studentName =
          entry.user_trainings?.users?.full_name?.toLowerCase() ||
          entry.user_trainings?.users?.email?.toLowerCase() ||
          "";
        const searchTerm = nameFilter.toLowerCase().trim();
        if (!studentName.includes(searchTerm)) {
          return false;
        }
      }

      return true;
    });
  }, [entries, statusFilter, nameFilter]);

  const handleApprove = async (entryId: string) => {
    setProcessingIds((prev) => new Set(prev).add(entryId));
    try {
      const result = await approveLogbookEntry(entryId, []);
      if (result.success) {
        router.refresh();
      } else {
        alert(result.error || "Failed to approve entry");
      }
    } catch (error) {
      alert("An error occurred. Please try again.");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(entryId);
        return next;
      });
    }
  };

  const handleRejectClick = (entryId: string) => {
    setRejectingEntryId(entryId);
  };

  const handleRejectConfirm = async (reason: string) => {
    if (!rejectingEntryId) return;
    setProcessingIds((prev) => new Set(prev).add(rejectingEntryId));
    try {
      const result = await rejectLogbookEntry(rejectingEntryId, reason);
      if (result.success) {
        setRejectingEntryId(null);
        router.refresh();
      } else {
        throw new Error(result.error || "Failed to reject entry");
      }
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(rejectingEntryId);
        return next;
      });
    }
  };

  function confirmSignAllFromReviewModal() {
    if (pendingCount === 0) return;
    setBulkFeedback(null);
    startBulkTransition(async () => {
      const result = await approveAllPendingLogbookEntries();
      if ("error" in result) {
        setBulkFeedback({ type: "error", message: result.error });
        return;
      }
      setBulkReviewOpen(false);
      if (result.warning) {
        setBulkFeedback({
          type: "warning",
          message: `Signed ${result.approvedCount} log entr${result.approvedCount === 1 ? "y" : "ies"}. ${result.warning}`,
        });
      } else if (result.approvedCount > 0) {
        setBulkFeedback({
          type: "success",
          message: `Signed ${result.approvedCount} log entr${result.approvedCount === 1 ? "y" : "ies"}.`,
        });
      }
      router.refresh();
    });
  }

  useEffect(() => {
    if (pendingCount === 0) setBulkReviewOpen(false);
  }, [pendingCount]);

  return (
    <div className="space-y-6">
      {pendingCount > 0 && (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between",
            "border-primary/25 bg-primary/[0.06] dark:bg-primary/10"
          )}
        >
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {pendingCount} log entr{pendingCount === 1 ? "y" : "ies"} awaiting your signature
            </p>
            <p className="text-sm text-muted-foreground">
              Open the list to confirm every entry, then sign all at once. Pending ACS on each row is
              applied the same as signing individually.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="shrink-0 gap-2"
            onClick={() => setBulkReviewOpen(true)}
          >
            <CheckCircle2 className="h-4 w-4" />
            Review and sign all…
          </Button>
        </div>
      )}

      <Dialog open={bulkReviewOpen} onOpenChange={setBulkReviewOpen}>
        <DialogContent className="flex max-h-[min(90vh,720px)] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sign all pending logs</DialogTitle>
            <DialogDescription>
              {pendingCount} entr{pendingCount === 1 ? "y" : "ies"} will be signed. Sorted by student,
              then newest date first within each student.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b bg-muted/50 text-left">
                <tr>
                  <th className="p-2 font-medium">Student</th>
                  <th className="p-2 font-medium whitespace-nowrap">Date</th>
                  <th className="p-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {bulkLinesSorted.map((row) => (
                  <tr key={row.id} className="border-b border-border/80 last:border-0 align-top">
                    <td className="p-2 font-medium">
                      {row.user_trainings?.users?.full_name ||
                        row.user_trainings?.users?.email ||
                        "—"}
                    </td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">
                      {formatUiDate(row.entry_date)}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      <span className="line-clamp-3" title={row.description}>
                        {row.description}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="secondary"
              disabled={isBulkApproving}
              onClick={() => setBulkReviewOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isBulkApproving || pendingCount === 0}
              className="gap-2"
              onClick={() => confirmSignAllFromReviewModal()}
            >
              {isBulkApproving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Sign all
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bulkFeedback && (
        <p
          className={cn(
            "text-sm rounded-md border px-3 py-2",
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
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="status-filter" className="text-sm whitespace-nowrap">Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(value: "draft" | "pending" | "all") => setStatusFilter(value)}
          >
            <SelectTrigger id="status-filter" className="w-[140px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <Label htmlFor="name-filter" className="text-sm whitespace-nowrap">Name</Label>
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

      {/* Entries List */}
      <div className="space-y-4">
        {filteredEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No logbook entries found matching the filters.
          </p>
        ) : (
          filteredEntries.map((entry) => {
            const isProcessing = processingIds.has(entry.id);
            const studentName =
              entry.user_trainings?.users?.full_name ||
              entry.user_trainings?.users?.email ||
              "Unknown Student";
            const statusDisplay = getStatusDisplay(entry.status);
            const isPending = entry.status === "submitted";

            return (
              <div
                key={entry.id}
                className={cn(
                  "p-4 rounded-lg border border-border bg-card transition-shadow space-y-3",
                  "hover:shadow-md cursor-pointer"
                )}
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{studentName}</span>
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
                    <Calendar className="h-3 w-3" />
                    <span>{formatUiDate(entry.entry_date)}</span>
                    <Clock className="h-3 w-3 ml-2" />
                    <span>{entry.hours_worked} hrs</span>
                  </div>
                </div>

                <p className="text-sm">{entry.description}</p>

                {(acsCodesByEntry[entry.id]?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {acsCodesByEntry[entry.id].map((code) => (
                      <span
                        key={code}
                        className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                )}

                {entry.skills_practiced && entry.skills_practiced.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {entry.skills_practiced.map((skill: string, idx: number) => (
                      <span
                        key={idx}
                        className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                )}

                {entry.challenges_encountered && (
                  <p className="text-xs text-muted-foreground">
                    <strong>Challenges:</strong> {entry.challenges_encountered}
                  </p>
                )}

                {entry.next_steps && (
                  <p className="text-xs text-muted-foreground">
                    <strong>Next Steps:</strong> {entry.next_steps}
                  </p>
                )}

                {isPending && (
                  <div className="flex gap-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handleApprove(entry.id)}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      {isProcessing ? "Processing..." : "Approve"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRejectClick(entry.id)}
                      disabled={isProcessing}
                      className="flex-1"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <RejectReasonDialog
        open={!!rejectingEntryId}
        onOpenChange={(open) => !open && setRejectingEntryId(null)}
        onConfirm={handleRejectConfirm}
        isSubmitting={rejectingEntryId ? processingIds.has(rejectingEntryId) : false}
      />

      {selectedEntry && (
        <AddEntryModal
          ataChapters={ataChapters}
          entry={{
            id: selectedEntry.id,
            entry_date: selectedEntry.entry_date,
            hours_worked: selectedEntry.hours_worked,
            description: selectedEntry.description,
            skills_practiced: selectedEntry.skills_practiced,
            status: selectedEntry.status,
            reject_reason: selectedEntry.reject_reason,
          }}
          mentorMode
          open={!!selectedEntry}
          onOpenChange={(open) => {
            if (!open) setSelectedEntry(null);
          }}
          onSuccess={() => {
            setSelectedEntry(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
