"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  createLogbookEntry,
  updateLogbookEntry,
  clearPendingAcsForLogbookEntry,
  getPendingAcsCodesForLogbookEntry,
  getPendingAcsCodesForLogbookEntryForReview,
} from "@/app/actions/logbook";
import { approveLogbookEntry, rejectLogbookEntry } from "@/app/actions/logbook-approval";
import { getAcsCodesByChapter } from "@/app/actions/acs-codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Plus, Clock, Calendar, Save, Pencil, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const logbookEntrySchema = z
  .object({
    entryDate: z.string().min(1, "Date is required"),
    startTime: z.string().min(1, "Start time is required"),
    endTime: z.string().min(1, "End time is required"),
    taskDescription: z
      .string()
      .min(10, "Task description must be at least 10 characters")
      .max(500, "Task description cannot exceed 500 characters"),
    ataChapter: z.string().min(1, "ATA Chapter is required"),
    certified: z.boolean(),
  })
  .refine((data) => {
    // Validate that end time is after start time
    const start = new Date(`2000-01-01 ${data.startTime}`);
    const end = new Date(`2000-01-01 ${data.endTime}`);
    return end > start;
  }, {
    message: "End time must be after start time",
    path: ["endTime"],
  });

type LogbookEntryFormData = z.infer<typeof logbookEntrySchema>;

export type AtaChapterOption = { value: string; label: string };

function calculateHours(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 0;

  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);

  const start = startHours * 60 + startMinutes;
  const end = endHours * 60 + endMinutes;

  // Handle overnight (end time is next day)
  const diff = end < start ? 24 * 60 - start + end : end - start;

  return Math.round((diff / 60) * 100) / 100; // Round to 2 decimal places
}

// Extract ATA chapter code from stored format "ATA: XX - Name"
function extractATAChapterCode(ataLabel: string | null | undefined): string {
  if (!ataLabel) return "";
  const match = ataLabel.match(/^(\d+)\s*-/);
  return match ? match[1] : "";
}

interface AddEntryModalProps {
  ataChapters: AtaChapterOption[];
  onSuccess?: () => void;
  entry?: {
    id: string;
    entry_date: string;
    hours_worked: number;
    description: string;
    skills_practiced?: string[] | null;
    status: string;
    reject_reason?: string | null;
  };
  trigger?: React.ReactNode;
  viewOnly?: boolean;
  /** When true, all fields are read-only except ACS codes which the mentor can edit */
  mentorMode?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, modal opens on mount (e.g. from dashboard "Log Entry" link) */
  defaultOpen?: boolean;
  /** When true, no trigger button is shown (modal opened programmatically only) */
  hideTrigger?: boolean;
}

export function AddEntryModal({ 
  ataChapters,
  onSuccess, 
  entry, 
  trigger, 
  viewOnly = false,
  mentorMode = false,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  hideTrigger = false
}: AddEntryModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [internalOpen, setInternalOpen] = useState(!!entry && !trigger || defaultOpen); // Auto-open if entry provided without trigger, or from add param
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = controlledOnOpenChange || setInternalOpen;
  
  const handleClose = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      onSuccess?.(); // Call onSuccess to clear selected entry in parent
      // Clear ?add=true from URL when closing (e.g. after navigating from dashboard)
      if (searchParams.get("add") === "true") {
        const url = new URL(window.location.href);
        url.searchParams.delete("add");
        router.replace(url.pathname + (url.search || ""));
      }
    }
  };
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const isEditMode = !!entry;
  const isViewMode = viewOnly || mentorMode || (entry && entry.status !== "draft" && entry.status !== "rejected");
  const acsCodesEditable = mentorMode;

  // Extract ATA chapter from existing entry
  const existingATAChapter = entry?.skills_practiced?.[0]?.replace(/^ATA:\s*/, "") || "";
  const ataChapterCode = extractATAChapterCode(existingATAChapter);

  // Calculate default times from hours (assuming 8am start)
  const defaultStartTime = "08:00";
  const calculateEndTime = (hours: number) => {
    const startMinutes = 8 * 60; // 8am
    const totalMinutes = startMinutes + Math.round(hours * 60);
    const hours24 = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${hours24.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<LogbookEntryFormData>({
    resolver: zodResolver(logbookEntrySchema),
    defaultValues: {
      entryDate: entry?.entry_date || new Date().toISOString().split("T")[0],
      startTime: defaultStartTime,
      endTime: entry?.hours_worked ? calculateEndTime(entry.hours_worked) : "17:00",
      taskDescription: entry?.description || "",
      ataChapter: ataChapterCode,
      certified: entry?.status === "submitted" || false,
    },
  });

  const startTime = watch("startTime");
  const endTime = watch("endTime");
  const taskDescription = watch("taskDescription");
  const ataChapter = watch("ataChapter");
  const certified = watch("certified");

  // ACS codes state
  const [acsCodes, setAcsCodes] = useState<Array<{ id: number; code: string; category: string; description: string | null; ata_chapter_numbers?: string[] }>>([]);
  const [selectedAcsCodeIds, setSelectedAcsCodeIds] = useState<Set<number>>(new Set());
  const [acsLoading, setAcsLoading] = useState(false);

  const prevAtaChapterRef = useRef<string | undefined>(undefined);

  // Reset prev chapter when modal opens so we don't treat initial load as "chapter change"
  useEffect(() => {
    if (isOpen) {
      prevAtaChapterRef.current = undefined;
    }
  }, [isOpen]);

  // Fetch ACS codes when chapter changes; clear selections on chapter change; load pending when editing
  useEffect(() => {
    if (!ataChapter) {
      setAcsCodes([]);
      setSelectedAcsCodeIds(new Set());
      return;
    }
    const isChapterChange = prevAtaChapterRef.current !== undefined && prevAtaChapterRef.current !== ataChapter;
    prevAtaChapterRef.current = ataChapter;

    if (isChapterChange && entry && isEditMode) {
      clearPendingAcsForLogbookEntry(entry.id);
    }

    setAcsLoading(true);
    getAcsCodesByChapter(ataChapter).then(async (codes) => {
      setAcsCodes(codes.map((c) => ({ id: c.id, code: c.code, category: c.category, description: c.description, ata_chapter_numbers: c.ata_chapter_numbers })));
      const codeIds = new Set(codes.map((c) => c.id));
      if (isChapterChange) {
        setSelectedAcsCodeIds(new Set());
      } else if (entry && (entry.status === "draft" || mentorMode)) {
        const pendingIds = mentorMode
          ? await getPendingAcsCodesForLogbookEntryForReview(entry.id)
          : await getPendingAcsCodesForLogbookEntry(entry.id);
        setSelectedAcsCodeIds(new Set(pendingIds.filter((id) => codeIds.has(id))));
      } else {
        setSelectedAcsCodeIds(new Set());
      }
      setAcsLoading(false);
    });
  }, [ataChapter, entry?.id, entry?.status, isEditMode, mentorMode]);

  const toggleAcsCode = (id: number) => {
    if (isViewMode && !acsCodesEditable) return;
    setSelectedAcsCodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Check if form is valid for submission
  const isFormValid = ataChapter && taskDescription && taskDescription.length >= 10;

  const totalHours = useMemo(() => {
    return calculateHours(startTime, endTime);
  }, [startTime, endTime]);

  // Reset form when entry changes or modal opens/closes
  useEffect(() => {
    if (isOpen && entry) {
      const existingATAChapter = entry.skills_practiced?.[0]?.replace(/^ATA:\s*/, "") || "";
      const ataChapterCode = extractATAChapterCode(existingATAChapter);
      const defaultStartTime = "08:00";
      const calculateEndTime = (hours: number) => {
        const startMinutes = 8 * 60;
        const totalMinutes = startMinutes + Math.round(hours * 60);
        const hours24 = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        return `${hours24.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      };

      reset({
        entryDate: entry.entry_date,
        startTime: defaultStartTime,
        endTime: entry.hours_worked ? calculateEndTime(entry.hours_worked) : "17:00",
        taskDescription: entry.description,
        ataChapter: ataChapterCode,
        certified: entry.status === "submitted" || false,
      });
    } else if (isOpen && !entry) {
      reset({
        entryDate: new Date().toISOString().split("T")[0],
        startTime: "08:00",
        endTime: "17:00",
        taskDescription: "",
        ataChapter: "",
        certified: false,
      });
    }
  }, [isOpen, entry, reset]);

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState<string | null>(null);

  const handleApprove = async () => {
    if (!entry) return;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await approveLogbookEntry(entry.id, Array.from(selectedAcsCodeIds));

      if (result.error) {
        setSubmitError(result.error);
        setIsSubmitting(false);
        return;
      }

      onSuccess?.();
      handleClose(false);
      router.refresh();
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectClick = () => {
    setRejectReason("");
    setRejectError(null);
    setRejectDialogOpen(true);
  };

  const handleRejectConfirm = async () => {
    if (!entry) return;
    setRejectError(null);
    setIsSubmitting(true);

    try {
      const result = await rejectLogbookEntry(entry.id, rejectReason);

      if (result.error) {
        setRejectError(result.error);
        setIsSubmitting(false);
        return;
      }

      setRejectDialogOpen(false);
      onSuccess?.();
      handleClose(false);
      router.refresh();
    } catch (error) {
      setRejectError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSubmit = async (data: LogbookEntryFormData) => {
    setSubmitError(null);
    setSubmitSuccess(false);
    setIsSubmitting(true);

    try {
      const result = isEditMode
        ? await updateLogbookEntry(entry!.id, {
            entryDate: data.entryDate,
            startTime: data.startTime,
            endTime: data.endTime,
            hoursWorked: totalHours,
            taskDescription: data.taskDescription,
            ataChapter: data.ataChapter,
            certified: data.certified,
            selectedAcsCodeIds: Array.from(selectedAcsCodeIds),
          })
        : await createLogbookEntry({
            entryDate: data.entryDate,
            startTime: data.startTime,
            endTime: data.endTime,
            hoursWorked: totalHours,
            taskDescription: data.taskDescription,
            ataChapter: data.ataChapter,
            certified: data.certified,
            selectedAcsCodeIds: Array.from(selectedAcsCodeIds),
          });

      if (result.error) {
        setSubmitError(result.error);
        setIsSubmitting(false);
        return;
      }

      setSubmitSuccess(true);
      reset();
      setTimeout(() => {
        setSubmitSuccess(false);
        setIsOpen(false);
        router.refresh();
        onSuccess?.();
      }, 1500);
      setIsSubmitting(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : "An unexpected error occurred. Please try again."
      );
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      {!hideTrigger && (
        trigger ? (
          <DialogTrigger asChild>{trigger}</DialogTrigger>
        ) : (
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          </DialogTrigger>
        )
      )}
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mentorMode ? "Review Logbook Entry" : isViewMode ? "View Logbook Entry" : isEditMode ? "Edit Logbook Entry" : "New Logbook Entry"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={(isViewMode && !mentorMode) ? (e) => e.preventDefault() : handleSubmit(onSubmit)} className="space-y-6">
          {submitError && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          {submitSuccess && (
            <div className="rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
              <Check className="h-4 w-4" />
              {isEditMode
                ? "Logbook entry updated successfully!"
                : "Logbook entry created successfully!"}
            </div>
          )}

          {/* Date Input */}
          <div className="space-y-2">
            <Label htmlFor="entryDate">Date</Label>
            <div className="relative">
              <Input
                id="entryDate"
                type="date"
                {...register("entryDate")}
                aria-invalid={errors.entryDate ? "true" : "false"}
                className="pr-10"
                disabled={isViewMode}
              />
              <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
            {errors.entryDate && (
              <p className="text-sm text-destructive">
                {errors.entryDate.message}
              </p>
            )}
          </div>

          {/* Task Description */}
          <div className="space-y-2">
            <Label htmlFor="taskDescription">Task Description</Label>
            <Textarea
              id="taskDescription"
              placeholder="Describe the work you performed..."
              {...register("taskDescription")}
              rows={4}
              maxLength={500}
              aria-invalid={errors.taskDescription ? "true" : "false"}
              className="resize-none"
              disabled={isViewMode}
            />
            <div className="flex justify-between items-center">
              <div className="text-xs text-muted-foreground">
                {taskDescription?.length || 0}/500 characters
              </div>
              {errors.taskDescription && (
                <p className="text-sm text-destructive">
                  {errors.taskDescription.message}
                </p>
              )}
            </div>
          </div>

          {/* Time Inputs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startTime">Start Time</Label>
              <div className="relative">
                <Input
                  id="startTime"
                  type="time"
                  {...register("startTime")}
                  aria-invalid={errors.startTime ? "true" : "false"}
                  className="pr-10"
                  disabled={isViewMode}
                />
                <Clock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              {errors.startTime && (
                <p className="text-sm text-destructive">
                  {errors.startTime.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime">End Time</Label>
              <div className="relative">
                <Input
                  id="endTime"
                  type="time"
                  {...register("endTime")}
                  aria-invalid={errors.endTime ? "true" : "false"}
                  className="pr-10"
                  disabled={isViewMode}
                />
                <Clock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              {errors.endTime && (
                <p className="text-sm text-destructive">
                  {errors.endTime.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Total Hours</Label>
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/20",
                  "text-primary font-semibold"
                )}
              >
                <Clock className="h-4 w-4" />
                <span>{totalHours}h</span>
              </div>
            </div>
          </div>

          {/* ATA Chapter */}
          <div className="space-y-2">
            <Label htmlFor="ataChapter">ATA Chapter</Label>
            <Select
              value={watch("ataChapter")}
              onValueChange={(value) => {
                setValue("ataChapter", value, { shouldValidate: true });
              }}
              disabled={isViewMode}
            >
              <SelectTrigger id="ataChapter" disabled={isViewMode}>
                <SelectValue placeholder="Select ATA Chapter" />
              </SelectTrigger>
              <SelectContent>
                {ataChapters.map((chapter) => (
                  <SelectItem key={chapter.value} value={chapter.value}>
                    {chapter.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.ataChapter && (
              <p className="text-sm text-destructive">
                {errors.ataChapter.message}
              </p>
            )}
          </div>

          {/* ACS Codes */}
          <div className="space-y-2">
            <Label>ACS Codes</Label>
            {!ataChapter ? (
              <p className="text-sm text-muted-foreground">
                Select an ATA chapter to see available ACS codes.
              </p>
            ) : acsLoading ? (
              <p className="text-sm text-muted-foreground">Loading ACS codes...</p>
            ) : acsCodes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No ACS codes found for this chapter.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                {acsCodes.map((acs) => (
                  <label
                    key={acs.id}
                    className={cn(
                      "flex items-start gap-3 p-2 rounded cursor-pointer hover:bg-muted/50",
                      isViewMode && !acsCodesEditable && "cursor-default hover:bg-transparent"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAcsCodeIds.has(acs.id)}
                      onChange={() => toggleAcsCode(acs.id)}
                      disabled={isViewMode && !acsCodesEditable}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{acs.code}</span>
                        <span className="text-muted-foreground text-xs">({acs.category})</span>
                        {acs.ata_chapter_numbers && acs.ata_chapter_numbers.length > 0 && (
                          <span className="text-xs text-muted-foreground/80" title="ATA chapters">
                            Ch {acs.ata_chapter_numbers.join(", ")}
                          </span>
                        )}
                      </div>
                      {acs.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate" title={acs.description}>
                          {acs.description}
                        </p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Certification Checkbox */}
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="certified"
                {...register("certified")}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                disabled={isViewMode}
              />
              <div className="flex-1">
                <Label htmlFor="certified" className="font-normal cursor-pointer">
                  I certify this information is accurate
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  By checking this box, you confirm the work described was
                  performed and the hours are accurate. This will submit the
                  entry for mentor signature.
                </p>
              </div>
            </div>
            {errors.certified && (
              <p className="text-sm text-destructive">
                {errors.certified.message}
              </p>
            )}
          </div>

          {entry?.reject_reason && (
            <div className="space-y-2 rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Rejection Reason</p>
              <p className="text-sm">{entry.reject_reason}</p>
            </div>
          )}

          {/* Action Buttons */}
          {(!isViewMode || mentorMode) && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              {mentorMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={handleRejectClick}
                  >
                    <XCircle className="mr-2 h-4 w-4" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleApprove}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {isSubmitting ? "Approving..." : "Approve"}
                  </Button>
                </>
              ) : (
                <Button type="submit" disabled={isSubmitting || !isFormValid}>
                  <Save className="mr-2 h-4 w-4" />
                  {isSubmitting
                    ? certified
                      ? "Submitting..."
                      : "Saving..."
                    : certified
                      ? "Submit for Signature"
                      : "Save Draft"}
                </Button>
              )}
            </div>
          )}
          {isViewMode && !mentorMode && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Close
              </Button>
            </div>
          )}
        </form>
      </DialogContent>

      {/* Reject reason dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Logbook Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for rejecting this entry. The apprentice will see this feedback and the entry will be returned to draft status.
            </p>
            {rejectError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {rejectError}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="rejectReason">Rejection reason</Label>
              <Textarea
                id="rejectReason"
                placeholder="e.g. Hours don't match the description, please add more detail..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={isSubmitting}
                onClick={handleRejectConfirm}
              >
                <XCircle className="mr-2 h-4 w-4" />
                {isSubmitting ? "Rejecting..." : "Reject"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
