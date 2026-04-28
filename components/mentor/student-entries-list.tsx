"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveLogbookEntry, rejectLogbookEntry } from "@/app/actions/logbook-approval";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddEntryModal } from "@/components/student/add-entry-modal";
import { RejectReasonDialog } from "@/components/mentor/reject-reason-dialog";

interface LogbookEntry {
  id: string;
  entry_date: string;
  hours_worked: number;
  description: string;
  skills_practiced: string[] | null;
  challenges_encountered: string | null;
  next_steps: string | null;
  status: "draft" | "submitted" | "approved" | "rejected";
  created_at: string;
  approved_at: string | null;
  reject_reason?: string | null;
}

export type AtaChapterOption = { value: string; label: string };

interface StudentEntriesListProps {
  entries: LogbookEntry[];
  entriesByStatus: {
    submitted: LogbookEntry[];
    approved: LogbookEntry[];
    rejected: LogbookEntry[];
    draft: LogbookEntry[];
  };
  acsCodesByEntry?: Record<string, string[]>;
  ataChapters: AtaChapterOption[];
}

export function StudentEntriesList({
  entries,
  entriesByStatus,
  acsCodesByEntry = {},
  ataChapters,
}: StudentEntriesListProps) {
  const router = useRouter();
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedEntry, setSelectedEntry] = useState<LogbookEntry | null>(null);
  const [rejectingEntryId, setRejectingEntryId] = useState<string | null>(null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

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

  const renderEntry = (entry: LogbookEntry) => {
    const isProcessing = processingIds.has(entry.id);
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
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{formatDate(entry.entry_date)}</span>
            <Clock className="h-4 w-4 ml-2 text-muted-foreground" />
            <span>{entry.hours_worked} hrs</span>
          </div>
          <span
            className={cn(
              "text-xs px-2 py-1 rounded-full",
              entry.status === "approved"
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                : entry.status === "rejected"
                ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
                : entry.status === "submitted"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                : "bg-muted text-muted-foreground"
            )}
          >
            {entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
          </span>
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

        {entry.approved_at && (
          <p className="text-xs text-muted-foreground">
            {entry.status === "approved"
              ? `Approved on ${formatDate(entry.approved_at)}`
              : entry.status === "rejected"
              ? `Rejected on ${formatDate(entry.approved_at)}`
              : null}
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
  };

  return (
    <Card className="bg-card">
      <CardHeader>
        <CardTitle>Logbook Entries</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All ({entries.length})</TabsTrigger>
            <TabsTrigger value="submitted">
              Pending ({entriesByStatus.submitted.length})
            </TabsTrigger>
            <TabsTrigger value="approved">
              Approved ({entriesByStatus.approved.length})
            </TabsTrigger>
            <TabsTrigger value="rejected">
              Rejected ({entriesByStatus.rejected.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4 mt-4">
            {entries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No logbook entries yet.
              </p>
            ) : (
              entries.map(renderEntry)
            )}
          </TabsContent>

          <TabsContent value="submitted" className="space-y-4 mt-4">
            {entriesByStatus.submitted.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No pending entries requiring approval.
              </p>
            ) : (
              entriesByStatus.submitted.map(renderEntry)
            )}
          </TabsContent>

          <TabsContent value="approved" className="space-y-4 mt-4">
            {entriesByStatus.approved.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No approved entries yet.
              </p>
            ) : (
              entriesByStatus.approved.map(renderEntry)
            )}
          </TabsContent>

          <TabsContent value="rejected" className="space-y-4 mt-4">
            {entriesByStatus.rejected.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No rejected entries.
              </p>
            ) : (
              entriesByStatus.rejected.map(renderEntry)
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

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
    </Card>
  );
}

