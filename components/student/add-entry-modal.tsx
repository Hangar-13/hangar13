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
  getAcsCodeDisplayRowsForLogbookEntry,
  type LogbookEntryAcsDisplayRow,
  getLogbookEntryStudentViewMeta,
  type LogbookEntryStudentViewMeta,
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
import { SearchableChapterSelect } from "./searchable-chapter-select";
import { AcsInclusionSwitchRow } from "@/components/manager/manager-acs-inclusion-toggle-row";
import {
  mergeLogbookAdditionalInformation,
  parseLogbookAdditionalInformation,
} from "@/lib/logbook-additional-information";

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
    logPageNumber: z
      .string()
      .optional()
      .refine(
        (s) => !s?.trim() || /^\d+$/.test(s.trim()),
        "Log page # must be a whole number"
      )
      .refine((s) => {
        if (!s?.trim()) return true;
        const n = parseInt(s.trim(), 10);
        return n >= 1 && n <= 9_999_999;
      }, "Log page # is out of range"),
    aircraft: z.string().max(200, "Aircraft is too long").optional(),
    additionalEngine: z.string().max(200).optional(),
    additionalPropeller: z.string().max(200).optional(),
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

function formatBadgeDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

type AcsListRow = {
  id: number;
  code: string;
  category: string;
  description: string | null;
  ata_chapter_numbers?: string[];
};

function acsCheckboxRowMatches(acs: AcsListRow, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [acs.code, acs.category, acs.description ?? "", ...(acs.ata_chapter_numbers ?? [])]
    .join(" ")
    .toLowerCase();
  return s.split(/\s+/).every((w) => w.length > 0 && hay.includes(w));
}

function acsBrowseRowMatches(acs: LogbookEntryAcsDisplayRow, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [acs.code, acs.description ?? ""].join(" ").toLowerCase();
  return s.split(/\s+/).every((w) => w.length > 0 && hay.includes(w));
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
    log_page_number?: number | null;
    aircraft?: string | null;
    additional_information?: unknown;
  };
  trigger?: React.ReactNode;
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
      setIsEditingEntry(false);
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
  const isNewEntry = !entry;
  const [isEditingEntry, setIsEditingEntry] = useState(false);
  const isStudent = !mentorMode;
  /** Browsing an existing entry (read-first); not used for mentor or new entry. */
  const isStudentBrowse = isEditMode && isStudent && !isEditingEntry;
  const isStudentEditor =
    isStudent &&
    (!isEditMode ||
      (isEditMode &&
        isEditingEntry &&
        entry &&
        (entry.status === "draft" || entry.status === "rejected")));
  const canStudentClickEdit =
    isStudent && entry && (entry.status === "draft" || entry.status === "rejected");
  const isViewMode =
    mentorMode ||
    (isStudent && isEditMode && (isStudentBrowse || entry?.status === "approved" || entry?.status === "submitted"));
  const acsCodesEditable = mentorMode;
  /** Checklist: browse OR locked-by-status uses list; student edit (draft/rejected) uses chapter picker. */
  const studentAcsListMode = isStudent && isEditMode && !isEditingEntry;
  const fieldLocked =
    mentorMode ||
    (isStudent &&
      isEditMode &&
      (isStudentBrowse || entry?.status === "approved" || entry?.status === "submitted"));

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
      logPageNumber:
        entry?.log_page_number != null ? String(entry.log_page_number) : "",
      aircraft: entry?.aircraft ?? "",
      additionalEngine: String(parseLogbookAdditionalInformation(entry?.additional_information).engine ?? ""),
      additionalPropeller: String(
        parseLogbookAdditionalInformation(entry?.additional_information).propeller ?? ""
      ),
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
  const [viewAcsRows, setViewAcsRows] = useState<LogbookEntryAcsDisplayRow[]>([]);
  const [viewAcsLoading, setViewAcsLoading] = useState(false);
  const [viewMeta, setViewMeta] = useState<LogbookEntryStudentViewMeta | null>(null);
  const [viewMetaLoading, setViewMetaLoading] = useState(false);
  /** Student new/edit only: off by default; on when editing an entry that has ACS, or when user enables. */
  const [enableAcsCodes, setEnableAcsCodes] = useState(false);
  const [acsDisableConfirmOpen, setAcsDisableConfirmOpen] = useState(false);
  const [acsListSearch, setAcsListSearch] = useState("");

  const prevAtaChapterRef = useRef<string | undefined>(undefined);

  const browseAcsFiltered = useMemo(
    () => viewAcsRows.filter((a) => acsBrowseRowMatches(a, acsListSearch)),
    [viewAcsRows, acsListSearch]
  );
  const pickerAcsFiltered = useMemo(
    () => acsCodes.filter((a) => acsCheckboxRowMatches(a, acsListSearch)),
    [acsCodes, acsListSearch]
  );

  // Reset prev chapter when modal opens so we don't treat initial load as "chapter change"
  useEffect(() => {
    if (isOpen) {
      prevAtaChapterRef.current = undefined;
    }
  }, [isOpen]);

  useEffect(() => {
    setAcsListSearch("");
  }, [ataChapter]);

  // New or existing entry: open in browse (read) / create state — not mid-edit
  useEffect(() => {
    if (isOpen && isStudent) {
      setIsEditingEntry(false);
    }
  }, [isOpen, isStudent, entry?.id]);

  // Load browse-mode labels for status badges
  useEffect(() => {
    if (!isOpen || !entry || !isStudentBrowse) {
      setViewMeta(null);
      setViewMetaLoading(false);
      return;
    }
    setViewMetaLoading(true);
    getLogbookEntryStudentViewMeta(entry.id)
      .then((r) => {
        if ("error" in r) {
          setViewMeta(null);
        } else {
          setViewMeta(r);
        }
        setViewMetaLoading(false);
      })
      .catch(() => {
        setViewMeta(null);
        setViewMetaLoading(false);
      });
  }, [isOpen, entry?.id, isStudentBrowse]);

  // Reset ACS toggle when opening or switching between entries (load then turns it on if the entry has codes)
  useEffect(() => {
    if (!isOpen) return;
    setEnableAcsCodes(false);
  }, [isOpen, entry?.id]);

  // Load only the entry's ACS code strings for student browse view (not the full chapter list)
  useEffect(() => {
    if (!isOpen || !entry || !studentAcsListMode) {
      setViewAcsRows([]);
      setViewAcsLoading(false);
      return;
    }
    setViewAcsLoading(true);
    getAcsCodeDisplayRowsForLogbookEntry(entry.id)
      .then((rows) => {
        setViewAcsRows(rows);
        setViewAcsLoading(false);
      })
      .catch(() => {
        setViewAcsRows([]);
        setViewAcsLoading(false);
      });
  }, [isOpen, entry?.id, studentAcsListMode]);

  // Fetch ACS codes when chapter changes; clear selections on chapter change; load pending when editing
  useEffect(() => {
    if (studentAcsListMode) {
      setAcsCodes([]);
      setSelectedAcsCodeIds(new Set());
      setAcsLoading(false);
      return;
    }
    if (isStudent && isNewEntry && !enableAcsCodes) {
      setAcsCodes([]);
      setSelectedAcsCodeIds(new Set());
      setAcsLoading(false);
      return;
    }
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
        const selected = pendingIds.filter((id) => codeIds.has(id));
        setSelectedAcsCodeIds(new Set(selected));
        if (isStudent && (entry.status === "draft" || entry.status === "rejected") && selected.length > 0) {
          setEnableAcsCodes(true);
        }
      } else {
        setSelectedAcsCodeIds(new Set());
      }
      setAcsLoading(false);
    });
  }, [ataChapter, entry?.id, entry?.status, isEditMode, isNewEntry, isStudent, mentorMode, studentAcsListMode, enableAcsCodes]);

  function handleEnableAcsChange(checked: boolean) {
    if (checked) {
      setEnableAcsCodes(true);
      return;
    }
    if (selectedAcsCodeIds.size > 0) {
      setAcsDisableConfirmOpen(true);
      return;
    }
    setEnableAcsCodes(false);
  }

  async function confirmDisableAcs() {
    if (entry?.id && isStudent) {
      await clearPendingAcsForLogbookEntry(entry.id);
    }
    setEnableAcsCodes(false);
    setSelectedAcsCodeIds(new Set());
    setAcsDisableConfirmOpen(false);
    router.refresh();
  }

  const toggleAcsCode = (id: number) => {
    if (isStudent && isEditMode && !isStudentEditor) return;
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

      const addl = parseLogbookAdditionalInformation(entry.additional_information);
      reset({
        entryDate: entry.entry_date,
        startTime: defaultStartTime,
        endTime: entry.hours_worked ? calculateEndTime(entry.hours_worked) : "17:00",
        taskDescription: entry.description,
        ataChapter: ataChapterCode,
        certified: entry.status === "submitted" || false,
        logPageNumber: entry.log_page_number != null ? String(entry.log_page_number) : "",
        aircraft: entry.aircraft ?? "",
        additionalEngine: addl.engine != null ? String(addl.engine) : "",
        additionalPropeller: addl.propeller != null ? String(addl.propeller) : "",
      });
    } else if (isOpen && !entry) {
      reset({
        entryDate: new Date().toISOString().split("T")[0],
        startTime: "08:00",
        endTime: "17:00",
        taskDescription: "",
        ataChapter: "",
        certified: false,
        logPageNumber: "",
        aircraft: "",
        additionalEngine: "",
        additionalPropeller: "",
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

  const backToBrowse = () => {
    if (!entry) return;
    setIsEditingEntry(false);
    const ex = entry.skills_practiced?.[0]?.replace(/^ATA:\s*/, "") || "";
    const ch = extractATAChapterCode(ex);
    const calculateEndTime = (hours: number) => {
      const startMinutes = 8 * 60;
      const totalMinutes = startMinutes + Math.round(hours * 60);
      const hours24 = Math.floor(totalMinutes / 60) % 24;
      const minutes = totalMinutes % 60;
      return `${hours24.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
    };
    const addl = parseLogbookAdditionalInformation(entry.additional_information);
    reset({
      entryDate: entry.entry_date,
      startTime: "08:00",
      endTime: entry.hours_worked ? calculateEndTime(entry.hours_worked) : "17:00",
      taskDescription: entry.description,
      ataChapter: ch,
      certified: false,
      logPageNumber: entry.log_page_number != null ? String(entry.log_page_number) : "",
      aircraft: entry.aircraft ?? "",
      additionalEngine: addl.engine != null ? String(addl.engine) : "",
      additionalPropeller: addl.propeller != null ? String(addl.propeller) : "",
    });
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

    const acsIdsToSave =
      mentorMode || enableAcsCodes ? Array.from(selectedAcsCodeIds) : [];

    const logPageFromForm = (() => {
      const t = data.logPageNumber?.trim();
      if (!t) return null;
      const n = parseInt(t, 10);
      return Number.isFinite(n) && n >= 1 ? n : null;
    })();
    const additionalInformation = mergeLogbookAdditionalInformation(
      isEditMode ? entry?.additional_information : null,
      data.additionalEngine ?? "",
      data.additionalPropeller ?? ""
    );

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
            selectedAcsCodeIds: acsIdsToSave,
            logPageNumber: logPageFromForm,
            aircraft: data.aircraft?.trim() || null,
            additionalInformation,
          })
        : await createLogbookEntry({
            entryDate: data.entryDate,
            startTime: data.startTime,
            endTime: data.endTime,
            hoursWorked: totalHours,
            taskDescription: data.taskDescription,
            ataChapter: data.ataChapter,
            certified: data.certified,
            selectedAcsCodeIds: acsIdsToSave,
            logPageNumber: logPageFromForm,
            aircraft: data.aircraft?.trim() || null,
            additionalInformation,
          });

      if (result.error) {
        setSubmitError(result.error);
        setIsSubmitting(false);
        return;
      }

      setSubmitSuccess(true);
      setIsEditingEntry(false);
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
            {mentorMode
              ? "Review Logbook Entry"
              : isStudent && isNewEntry
                ? "New Logbook Entry"
                : isStudent && isStudentBrowse
                  ? "View Logbook Entry"
                  : isStudent && isStudentEditor
                    ? "Edit Logbook Entry"
                    : isEditMode
                      ? "Logbook Entry"
                      : "New Logbook Entry"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            if (mentorMode) {
              e.preventDefault();
              return;
            }
            if (isStudent && isEditMode && !isStudentEditor) {
              e.preventDefault();
              return;
            }
            return handleSubmit(onSubmit)(e);
          }}
          className="space-y-6"
        >
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
          <div className="space-y-1">
            <div className="flex min-w-0 flex-row items-center gap-3">
              <Label
                htmlFor="entryDate"
                className="w-32 shrink-0 text-sm font-medium text-muted-foreground"
              >
                Date
              </Label>
              <div className="relative min-w-0 flex-1">
                <Input
                  id="entryDate"
                  type="date"
                  {...register("entryDate")}
                  aria-invalid={errors.entryDate ? "true" : "false"}
                  className="h-9 pr-10"
                  disabled={fieldLocked}
                />
                <Calendar className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            {errors.entryDate && (
              <p className="text-sm text-destructive pl-[calc(8rem+0.75rem)]">
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
              disabled={fieldLocked}
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
                  disabled={fieldLocked}
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
                  disabled={fieldLocked}
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

          {/* ATA Chapter — searchable when editing; plain select when read-only */}
          <div className="space-y-2">
            <Label htmlFor="ataChapter">ATA Chapter</Label>
            {fieldLocked ? (
              <Select
                value={watch("ataChapter")}
                onValueChange={(v) => setValue("ataChapter", v, { shouldValidate: true })}
                disabled
              >
                <SelectTrigger id="ataChapter" disabled>
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
            ) : (
              <SearchableChapterSelect
                id="ataChapter"
                value={watch("ataChapter") ?? ""}
                onChapterSelectAction={(v) => setValue("ataChapter", v, { shouldValidate: true })}
                options={ataChapters}
                placeholder="Select ATA Chapter"
                aria-invalid={!!errors.ataChapter}
              />
            )}
            {errors.ataChapter && (
              <p className="text-sm text-destructive">
                {errors.ataChapter.message}
              </p>
            )}
          </div>

          {/* ACS Codes — student browse: list; student new/edit: optional toggle; mentor: always */}
          {studentAcsListMode && !viewAcsLoading && viewAcsRows.length > 0 ? (
            <div className="space-y-2">
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="text-sm font-medium text-muted-foreground shrink-0">ACS Codes</div>
                <Input
                  type="search"
                  value={acsListSearch}
                  onChange={(e) => setAcsListSearch(e.target.value)}
                  placeholder="Search by code or description…"
                  className="h-8 min-w-0 flex-1 sm:max-w-xs"
                  aria-label="Filter ACS codes"
                />
              </div>
              {browseAcsFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground pl-1">
                  No ACS codes match your search.
                </p>
              ) : (
                <ul className="list-disc pl-5 space-y-1.5 text-sm">
                  {browseAcsFiltered.map((c) => (
                    <li key={c.id}>
                      <span className="font-mono font-medium">{c.code}</span>
                      {c.description ? (
                        <span className="text-muted-foreground">
                          {" "}
                          — {c.description}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : !studentAcsListMode ? (
            <div className="space-y-3">
              {isStudent && (isNewEntry || isStudentEditor) && (
                <AcsInclusionSwitchRow
                  id="student-logbook-enable-acs"
                  include={enableAcsCodes}
                  onChange={handleEnableAcsChange}
                />
              )}
              {(mentorMode || ((isNewEntry || isStudentEditor) && enableAcsCodes)) && (
            <div className="space-y-2">
            {!ataChapter ? (
              <>
                <div className="text-sm font-medium">ACS Codes</div>
                <p className="text-sm text-muted-foreground">
                  Select an ATA chapter to see available ACS codes.
                </p>
              </>
            ) : acsLoading ? (
              <>
                <div className="text-sm font-medium">ACS Codes</div>
                <p className="text-sm text-muted-foreground">Loading ACS codes...</p>
              </>
            ) : acsCodes.length === 0 ? (
              <>
                <div className="text-sm font-medium">ACS Codes</div>
                <p className="text-sm text-muted-foreground">
                  No ACS codes found for this chapter.
                </p>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <Label className="text-sm font-medium leading-none">ACS Codes</Label>
                  <Input
                    type="search"
                    value={acsListSearch}
                    onChange={(e) => setAcsListSearch(e.target.value)}
                    placeholder="Search by code, category, or ATA…"
                    disabled={!acsCodesEditable && (isViewMode || (isStudent && !isStudentEditor))}
                    className="h-8 min-w-0 flex-1 sm:max-w-xs"
                    aria-label="Filter ACS codes"
                  />
                </div>
                {pickerAcsFiltered.length === 0 ? (
                  <p className="text-sm text-muted-foreground pl-0.5">
                    No ACS codes match your search.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-2">
                    {pickerAcsFiltered.map((acs) => (
                      <label
                        key={acs.id}
                        className={cn(
                          "flex items-start gap-3 p-2 rounded cursor-pointer hover:bg-muted/50",
                          !acsCodesEditable && (isViewMode || (isStudent && !isStudentEditor)) && "cursor-default hover:bg-transparent"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selectedAcsCodeIds.has(acs.id)}
                          onChange={() => toggleAcsCode(acs.id)}
                          disabled={!acsCodesEditable && (isViewMode || (isStudent && !isStudentEditor))}
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
            )}
            </div>
              )}
            </div>
          ) : null}

          <div className="space-y-4">
            <hr className="border-border" />
            <h3 className="text-sm font-semibold text-foreground">Optional</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex min-w-0 flex-row items-center gap-3">
                  <Label
                    htmlFor="logPageNumber"
                    className="w-32 shrink-0 text-sm font-medium text-muted-foreground"
                  >
                    Log page #
                  </Label>
                  <Input
                    id="logPageNumber"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="e.g. 12"
                    {...register("logPageNumber")}
                    disabled={fieldLocked}
                    className="h-9 min-w-0 flex-1 bg-white dark:bg-white"
                    aria-invalid={errors.logPageNumber ? "true" : "false"}
                  />
                </div>
                {errors.logPageNumber && (
                  <p className="text-sm text-destructive pl-[calc(8rem+0.75rem)]">
                    {errors.logPageNumber.message}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <div className="flex min-w-0 flex-row items-center gap-3">
                  <Label
                    htmlFor="aircraft"
                    className="w-32 shrink-0 text-sm font-medium text-muted-foreground"
                  >
                    Aircraft
                  </Label>
                  <Input
                    id="aircraft"
                    type="text"
                    autoComplete="off"
                    placeholder="Type of aircraft worked on"
                    {...register("aircraft")}
                    maxLength={200}
                    disabled={fieldLocked}
                    className="h-9 min-w-0 flex-1 bg-white dark:bg-white"
                    aria-invalid={errors.aircraft ? "true" : "false"}
                  />
                </div>
                {errors.aircraft && (
                  <p className="text-sm text-destructive pl-[calc(8rem+0.75rem)]">
                    {errors.aircraft.message}
                  </p>
                )}
              </div>
              <div className="flex min-w-0 flex-row items-center gap-3">
                <Label
                  htmlFor="additionalEngine"
                  className="w-32 shrink-0 text-sm font-medium text-muted-foreground"
                >
                  Engine
                </Label>
                <Input
                  id="additionalEngine"
                  type="text"
                  autoComplete="off"
                  placeholder="Only for work with engines"
                  {...register("additionalEngine")}
                  maxLength={200}
                  disabled={fieldLocked}
                  className="h-9 min-w-0 flex-1 bg-white dark:bg-white"
                />
              </div>
              <div className="flex min-w-0 flex-row items-center gap-3">
                <Label
                  htmlFor="additionalPropeller"
                  className="w-32 shrink-0 text-sm font-medium text-muted-foreground"
                >
                  Propeller
                </Label>
                <Input
                  id="additionalPropeller"
                  type="text"
                  autoComplete="off"
                  placeholder="Only for work with propellors"
                  {...register("additionalPropeller")}
                  maxLength={200}
                  disabled={fieldLocked}
                  className="h-9 min-w-0 flex-1 bg-white dark:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Browse: status badges. Edit: certification */}
          {isStudent && isStudentBrowse && !mentorMode && (
            <div className="space-y-1.5">
              {viewMetaLoading ? (
                <div
                  className="h-5 w-40 max-w-full rounded-full bg-muted/50 animate-pulse"
                  aria-hidden
                />
              ) : viewMeta && entry ? (
                <div className="flex flex-col items-start gap-1.5">
                  {entry.status === "draft" ? (
                    <span
                      className="inline-flex w-fit max-w-full items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs text-yellow-950 dark:bg-yellow-500/25 dark:text-yellow-100"
                    >
                      Draft saved by {viewMeta.studentName} on {formatBadgeDate(viewMeta.lastSavedAt)}
                    </span>
                  ) : (
                    <>
                      <span
                        className="inline-flex w-fit max-w-full items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-950 dark:bg-green-600/30 dark:text-green-100"
                      >
                        Submitted by {viewMeta.studentName} on{" "}
                        {formatBadgeDate(viewMeta.submittedAt || viewMeta.lastSavedAt)}
                      </span>
                      {entry.status === "submitted" && (
                        <span
                          className="inline-flex w-fit max-w-full items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs text-yellow-950 dark:bg-yellow-500/25 dark:text-yellow-100"
                        >
                          Pending signature
                        </span>
                      )}
                      {entry.status === "approved" && (
                        <span
                          className="inline-flex w-fit max-w-full items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-950 dark:bg-green-600/30 dark:text-green-100"
                        >
                          {viewMeta.approverName && viewMeta.approvedAt
                            ? `Signed by ${viewMeta.approverName} on ${formatBadgeDate(viewMeta.approvedAt)}`
                            : viewMeta.approvedAt
                              ? `Signed on ${formatBadgeDate(viewMeta.approvedAt)}`
                              : "Signed"}
                        </span>
                      )}
                      {entry.status === "rejected" && (
                        <span
                          className="inline-flex w-fit max-w-full items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs text-red-950 dark:bg-red-600/30 dark:text-red-100"
                        >
                          Rejected by {viewMeta.mentorName} on {formatBadgeDate(viewMeta.lastSavedAt)}
                        </span>
                      )}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {!mentorMode && (isNewEntry || isStudentEditor) && (
            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="certified"
                  {...register("certified")}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
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
          )}

          {entry?.reject_reason && (
            <div className="space-y-2 rounded-md border-2 border-red-500 bg-red-50 dark:bg-red-950/30 p-4">
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Rejection Reason</p>
              <p className="text-sm">{entry.reject_reason}</p>
            </div>
          )}

          {/* Action Buttons */}
          {mentorMode && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={handleRejectClick}
              >
                <XCircle className="mr-2 h-4 w-4" />
                Reject
              </Button>
              <Button type="button" disabled={isSubmitting} onClick={handleApprove}>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {isSubmitting ? "Approving..." : "Approve"}
              </Button>
            </div>
          )}

          {!mentorMode && (isNewEntry || isStudentEditor) && (
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (isStudent && entry && isEditingEntry) {
                    backToBrowse();
                  } else {
                    handleClose(false);
                  }
                }}
              >
                {isStudent && entry && isEditingEntry ? "Cancel" : "Cancel"}
              </Button>
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
            </div>
          )}

          {isStudent && isEditMode && isStudentBrowse && (
            <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Close
              </Button>
              {canStudentClickEdit && entry?.status !== "approved" && (
                <Button type="button" onClick={() => setIsEditingEntry(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </form>
      </DialogContent>

      {/* Turn off ACS: confirm removal of selected codes */}
      <Dialog open={acsDisableConfirmOpen} onOpenChange={setAcsDisableConfirmOpen}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Remove ACS codes?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Turning off ACS codes will clear your selected codes from this log entry. You can re-enable ACS codes
            and pick codes again before saving, or save to store the entry without ACS codes.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setAcsDisableConfirmOpen(false)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDisableAcs}>
              Remove ACS codes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Logbook Entry</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for rejecting this entry. The student will see this feedback and the entry will be returned to draft status.
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
