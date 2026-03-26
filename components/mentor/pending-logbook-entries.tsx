"use client";

import { useState, useMemo, useEffect } from "react";
import { Calendar, Clock, User, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { approveLogbookEntry, rejectLogbookEntry } from "@/app/actions/logbook-approval";
import { useRouter } from "next/navigation";
import { AddEntryModal } from "@/components/apprentice/add-entry-modal";
import { RejectReasonDialog } from "@/components/mentor/reject-reason-dialog";
import { cn } from "@/lib/utils";

interface PendingLogbookEntry {
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
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<PendingLogbookEntry | null>(null);
  const [rejectingEntryId, setRejectingEntryId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"draft" | "pending" | "all">("pending");
  const [nameFilter, setNameFilter] = useState<string>(initialNameFilter);

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

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

      // Filter by apprentice name
      if (nameFilter.trim()) {
        const apprenticeName =
          entry.user_trainings?.users?.full_name?.toLowerCase() ||
          entry.user_trainings?.users?.email?.toLowerCase() ||
          "";
        const searchTerm = nameFilter.toLowerCase().trim();
        if (!apprenticeName.includes(searchTerm)) {
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

  return (
    <div className="space-y-6">
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
            const apprenticeName =
              entry.user_trainings?.users?.full_name ||
              entry.user_trainings?.users?.email ||
              "Unknown Apprentice";
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
                    <span className="font-medium">{apprenticeName}</span>
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
                    <span>{formatDate(entry.entry_date)}</span>
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
