"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
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
  setLogbookEntryPendingAcsForMentorReview,
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Check, Plus, Clock, Calendar, Save, Pencil, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUiDateTime } from "@/lib/format-ui-date";
import { SearchableChapterSelect } from "./searchable-chapter-select";
import { SearchableEquipmentCombobox } from "./searchable-equipment-combobox";
import { AcsInclusionSwitchRow } from "@/components/manager/manager-acs-inclusion-toggle-row";
import {
  mergeLogbookAdditionalInformation,
  parseLogbookAdditionalInformation,
} from "@/lib/logbook-additional-information";
import { Switch } from "@/components/ui/switch";
import {
  getLogbookMentorContext,
  searchMechanicMentorsForLogbook,
  createInvisibleMechanicMentorAndAssignAction,
  isMechanicCertificateNumberTakenAction,
  clearInvisibleAssignedMentorAction,
  type LogbookMentorContext,
  type MechanicMentorSearchRow,
} from "@/app/actions/logbook-mentor";

function formatMechanicDisplayLine(m: {
  full_name: string | null;
  mechanic_certificate_type: string | null;
  mechanic_certificate_number: string | null;
}) {
  const name = (m.full_name && m.full_name.trim()) || "Mentor";
  const t = (m.mechanic_certificate_type && m.mechanic_certificate_type.trim()) || "A&P";
  const n = m.mechanic_certificate_number?.trim();
  if (n) return `${name} (${t} ${n})`;
  return `${name} (${t})`;
}

/** One letter A–Z followed by exactly 7 digits (e.g. A1234567). */
const MECHANIC_CERT_NUMBER_REGEX = /^[A-Z][0-9]{7}$/;

function isValidMechanicCertNumber(value: string): boolean {
  return MECHANIC_CERT_NUMBER_REGEX.test(value.trim().toUpperCase());
}

function sanitizeMechanicCertNumberInput(raw: string): string {
  const u = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (u.length === 0) return "";
  let letter = "";
  let digits = "";
  for (const ch of u) {
    if (!letter) {
      if (/[A-Z]/.test(ch)) letter = ch;
      continue;
    }
    if (/\d/.test(ch) && digits.length < 7) digits += ch;
  }
  return letter + digits;
}

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
    return formatUiDateTime(iso);
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
    control,
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
  const [mentorAcsUiMode, setMentorAcsUiMode] = useState<"summary" | "edit">(
    "summary"
  );
  const [mentorAcsSummaryRows, setMentorAcsSummaryRows] = useState<
    LogbookEntryAcsDisplayRow[]
  >([]);
  const [mentorAcsSummaryLoading, setMentorAcsSummaryLoading] = useState(false);
  const [mentorCtx, setMentorCtx] = useState<LogbookMentorContext | { error: string } | null>(
    null
  );
  const [mentorCtxLoading, setMentorCtxLoading] = useState(false);
  const [mentorSigningEnabled, setMentorSigningEnabled] = useState(false);
  const [mentorFirstName, setMentorFirstName] = useState("");
  const [mentorLastName, setMentorLastName] = useState("");
  const [mentorCertType, setMentorCertType] = useState<"A" | "P" | "A&P" | "AME">(
    "A&P"
  );
  const [mentorCertNumber, setMentorCertNumber] = useState("");
  const [mentorSearchLoading, setMentorSearchLoading] = useState(false);
  const [mentorSearchRows, setMentorSearchRows] = useState<MechanicMentorSearchRow[]>([]);
  const [selectedMentorUserId, setSelectedMentorUserId] = useState<string | null>(null);
  const [mentorActionError, setMentorActionError] = useState<string | null>(null);
  const [mentorCreateBusy, setMentorCreateBusy] = useState(false);
  const [removeExternalMentorOpen, setRemoveExternalMentorOpen] = useState(false);
  const [mentorRemoveBusy, setMentorRemoveBusy] = useState(false);
  const [certNumberTaken, setCertNumberTaken] = useState<boolean | null>(null);
  const [certTakenChecking, setCertTakenChecking] = useState(false);

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
    if (!isOpen || !isStudent || !(isNewEntry || isStudentEditor)) {
      return;
    }
    let cancelled = false;
    (async () => {
      setMentorCtxLoading(true);
      setMentorActionError(null);
      const res = await getLogbookMentorContext();
      if (cancelled) return;
      setMentorCtx(res);
      setMentorCtxLoading(false);
      if ("error" in res) {
        return;
      }
      if (res.hasAssignedMentor && res.mentor) {
        setMentorSigningEnabled(true);
        setSelectedMentorUserId(res.mentor.id);
      } else {
        setMentorSigningEnabled(false);
        setSelectedMentorUserId(null);
        setMentorFirstName("");
        setMentorLastName("");
        setMentorCertNumber("");
        setMentorCertType("A&P");
        setMentorSearchRows([]);
        setCertNumberTaken(null);
        setCertTakenChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, isStudent, isNewEntry, isStudentEditor, entry?.id]);

  useEffect(() => {
    if (
      !mentorSigningEnabled ||
      mentorCtxLoading ||
      ("hasAssignedMentor" in (mentorCtx ?? {}) &&
        (mentorCtx as LogbookMentorContext)?.hasAssignedMentor)
    ) {
      return;
    }
    const q = `${mentorFirstName} ${mentorLastName} ${mentorCertNumber}`.trim();
    if (q.length < 2) {
      setMentorSearchRows([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setMentorSearchLoading(true);
        const res = await searchMechanicMentorsForLogbook(q);
        setMentorSearchLoading(false);
        if ("rows" in res) {
          setMentorSearchRows(res.rows);
        } else {
          setMentorSearchRows([]);
        }
      })();
    }, 320);
    return () => window.clearTimeout(t);
  }, [
    mentorFirstName,
    mentorLastName,
    mentorCertNumber,
    mentorSigningEnabled,
    mentorCtxLoading,
    mentorCtx,
  ]);

  useEffect(() => {
    if (
      !mentorSigningEnabled ||
      selectedMentorUserId ||
      !isValidMechanicCertNumber(mentorCertNumber)
    ) {
      setCertNumberTaken(null);
      setCertTakenChecking(false);
      return;
    }
    let cancelled = false;
    setCertTakenChecking(true);
    const t = window.setTimeout(() => {
      void (async () => {
        const res = await isMechanicCertificateNumberTakenAction(
          mentorCertNumber.trim().toUpperCase()
        );
        if (cancelled) return;
        setCertTakenChecking(false);
        if ("error" in res) {
          setCertNumberTaken(null);
          return;
        }
        setCertNumberTaken(res.taken);
      })();
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    mentorSigningEnabled,
    selectedMentorUserId,
    mentorCertNumber,
  ]);

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

  useEffect(() => {
    if (!isOpen || !mentorMode) return;
    setMentorAcsUiMode("summary");
  }, [isOpen, mentorMode, entry?.id]);

  useEffect(() => {
    if (!isOpen || !mentorMode || !entry?.id) {
      setMentorAcsSummaryRows([]);
      setMentorAcsSummaryLoading(false);
      return;
    }
    setMentorAcsSummaryLoading(true);
    getAcsCodeDisplayRowsForLogbookEntry(entry.id)
      .then((rows) => {
        setMentorAcsSummaryRows(rows);
      })
      .catch(() => {
        setMentorAcsSummaryRows([]);
      })
      .finally(() => {
        setMentorAcsSummaryLoading(false);
      });
  }, [isOpen, mentorMode, entry?.id]);

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
    if (mentorMode && mentorAcsUiMode === "summary") {
      setAcsCodes([]);
      setAcsLoading(false);
      setSelectedAcsCodeIds(new Set());
      return;
    }
    if (isStudent && isNewEntry && !enableAcsCodes) {
      setAcsCodes([]);
      setSelectedAcsCodeIds(new Set());
      setAcsLoading(false);
      return;
    }
    if (mentorMode && mentorAcsUiMode === "edit" && !enableAcsCodes) {
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
      if (mentorMode) {
        void setLogbookEntryPendingAcsForMentorReview(entry.id, []);
      } else {
        void clearPendingAcsForLogbookEntry(entry.id);
      }
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
  }, [ataChapter, entry?.id, entry?.status, isEditMode, isNewEntry, isStudent, mentorMode, mentorAcsUiMode, studentAcsListMode, enableAcsCodes]);

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
    if (entry?.id && mentorMode) {
      const res = await setLogbookEntryPendingAcsForMentorReview(entry.id, []);
      if ("error" in res) {
        setSubmitError(res.error);
        setAcsDisableConfirmOpen(false);
        return;
      }
      const rows = await getAcsCodeDisplayRowsForLogbookEntry(entry.id);
      setMentorAcsSummaryRows(rows);
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

  const hasAssignedMentor =
    mentorCtx !== null && "hasAssignedMentor" in mentorCtx && mentorCtx.hasAssignedMentor;

  const mentorSigningRequiredOk =
    !certified ||
    !isStudent ||
    !(isNewEntry || isStudentEditor) ||
    mentorCtxLoading ||
    "error" in (mentorCtx ?? {}) ||
    hasAssignedMentor ||
    !mentorSigningEnabled ||
    (Boolean(selectedMentorUserId) &&
      (!certified || isValidMechanicCertNumber(mentorCertNumber)));

  const canSubmitForm = isFormValid && mentorSigningRequiredOk;

  const mentorSearchQueryTrimmed = useMemo(
    () => `${mentorFirstName} ${mentorLastName} ${mentorCertNumber}`.trim(),
    [mentorFirstName, mentorLastName, mentorCertNumber]
  );

  const createMentorEligible = useMemo(
    () =>
      mentorSigningEnabled &&
      !selectedMentorUserId &&
      Boolean(mentorFirstName.trim()) &&
      Boolean(mentorLastName.trim()) &&
      isValidMechanicCertNumber(mentorCertNumber) &&
      !mentorSearchLoading &&
      mentorSearchRows.length === 0 &&
      mentorSearchQueryTrimmed.length >= 2 &&
      !certTakenChecking &&
      certNumberTaken !== true,
    [
      mentorSigningEnabled,
      selectedMentorUserId,
      mentorFirstName,
      mentorLastName,
      mentorCertNumber,
      mentorSearchLoading,
      mentorSearchRows.length,
      mentorSearchQueryTrimmed,
      certTakenChecking,
      certNumberTaken,
    ]
  );

  const showMentorNoMatchesHint =
    mentorSigningEnabled &&
    !mentorSearchLoading &&
    mentorSearchRows.length === 0 &&
    mentorSearchQueryTrimmed.length >= 2 &&
    !selectedMentorUserId &&
    !createMentorEligible;

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

  async function finishMentorAcsEdit() {
    if (!entry?.id || !mentorMode) return;
    setSubmitError(null);
    const r = await setLogbookEntryPendingAcsForMentorReview(
      entry.id,
      enableAcsCodes ? Array.from(selectedAcsCodeIds) : []
    );
    if ("error" in r) {
      setSubmitError(r.error);
      return;
    }
    const rows = await getAcsCodeDisplayRowsForLogbookEntry(entry.id);
    setMentorAcsSummaryRows(rows);
    setMentorAcsUiMode("summary");
    router.refresh();
  }

  const handleApprove = async () => {
    if (!entry) return;
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      if (mentorMode && mentorAcsUiMode === "edit" && !enableAcsCodes) {
        const cleared = await setLogbookEntryPendingAcsForMentorReview(entry.id, []);
        if ("error" in cleared) {
          setSubmitError(cleared.error);
          setIsSubmitting(false);
          return;
        }
      }

      const acsForApprove =
        mentorMode && mentorAcsUiMode === "edit" && enableAcsCodes
          ? Array.from(selectedAcsCodeIds)
          : [];

      const result = await approveLogbookEntry(entry.id, acsForApprove);

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
      if (
        data.certified &&
        isStudent &&
        (isNewEntry || isStudentEditor) &&
        !hasAssignedMentor &&
        mentorSigningEnabled &&
        selectedMentorUserId &&
        !isValidMechanicCertNumber(mentorCertNumber)
      ) {
        setSubmitError(
          "Mechanic certificate number must be one letter (A–Z) followed by exactly 7 digits."
        );
        setIsSubmitting(false);
        return;
      }

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
            mentorSigningEnabled: !hasAssignedMentor && mentorSigningEnabled,
            selectedMentorUserId: !hasAssignedMentor ? selectedMentorUserId : null,
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
            mentorSigningEnabled: !hasAssignedMentor && mentorSigningEnabled,
            selectedMentorUserId: !hasAssignedMentor ? selectedMentorUserId : null,
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

          {/* ACS Codes — student browse: list; mentor: summary + edit; student new/edit: optional toggle */}
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
          ) : mentorMode && entry ? (
            <>
              {mentorAcsUiMode === "edit" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-sm font-medium">ACS codes</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void finishMentorAcsEdit()}
                    >
                      Done editing
                    </Button>
                  </div>
                  <AcsInclusionSwitchRow
                    id="mentor-logbook-enable-acs"
                    include={enableAcsCodes}
                    onChange={handleEnableAcsChange}
                  />
                  {enableAcsCodes && (
                    <div className="space-y-2">
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
                        <div className="space-y-2">
                          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <Label className="text-sm font-medium leading-none">ACS Codes</Label>
                            <Input
                              type="search"
                              value={acsListSearch}
                              onChange={(e) => setAcsListSearch(e.target.value)}
                              placeholder="Search by code, category, or ATA…"
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
                                  className="flex items-start gap-3 p-2 rounded cursor-pointer hover:bg-muted/50"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedAcsCodeIds.has(acs.id)}
                                    onChange={() => toggleAcsCode(acs.id)}
                                    className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-sm">{acs.code}</span>
                                      <span className="text-muted-foreground text-xs">
                                        ({acs.category})
                                      </span>
                                      {acs.ata_chapter_numbers &&
                                        acs.ata_chapter_numbers.length > 0 && (
                                          <span
                                            className="text-xs text-muted-foreground/80"
                                            title="ATA chapters"
                                          >
                                            Ch {acs.ata_chapter_numbers.join(", ")}
                                          </span>
                                        )}
                                    </div>
                                    {acs.description && (
                                      <p
                                        className="text-xs text-muted-foreground mt-0.5 truncate"
                                        title={acs.description}
                                      >
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
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">ACS codes</div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      title="Edit ACS codes"
                      aria-label="Edit ACS codes"
                      onClick={() => {
                        setMentorAcsUiMode("edit");
                        setEnableAcsCodes(mentorAcsSummaryRows.length > 0);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                  {mentorAcsSummaryLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : mentorAcsSummaryRows.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1.5 text-sm">
                      {mentorAcsSummaryRows.map((c) => (
                        <li key={c.id}>
                          <span className="font-mono font-medium">{c.code}</span>
                          {c.description ? (
                            <span className="text-muted-foreground"> — {c.description}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </>
          ) : !studentAcsListMode && !mentorMode ? (
            <div className="space-y-3">
              {isStudent && (isNewEntry || isStudentEditor) && (
                <AcsInclusionSwitchRow
                  id="student-logbook-enable-acs"
                  include={enableAcsCodes}
                  onChange={handleEnableAcsChange}
                />
              )}
              {(isNewEntry || isStudentEditor) && enableAcsCodes && (
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
                                !acsCodesEditable &&
                                  (isViewMode || (isStudent && !isStudentEditor)) &&
                                  "cursor-default hover:bg-transparent"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={selectedAcsCodeIds.has(acs.id)}
                                onChange={() => toggleAcsCode(acs.id)}
                                disabled={
                                  !acsCodesEditable &&
                                  (isViewMode || (isStudent && !isStudentEditor))
                                }
                                className="mt-1 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm">{acs.code}</span>
                                  <span className="text-muted-foreground text-xs">
                                    ({acs.category})
                                  </span>
                                  {acs.ata_chapter_numbers &&
                                    acs.ata_chapter_numbers.length > 0 && (
                                      <span
                                        className="text-xs text-muted-foreground/80"
                                        title="ATA chapters"
                                      >
                                        Ch {acs.ata_chapter_numbers.join(", ")}
                                      </span>
                                    )}
                                </div>
                                {acs.description && (
                                  <p
                                    className="text-xs text-muted-foreground mt-0.5 truncate"
                                    title={acs.description}
                                  >
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
                  <div className="min-w-0 flex-1">
                    <Controller
                      name="aircraft"
                      control={control}
                      render={({ field }) => (
                        <SearchableEquipmentCombobox
                          id="aircraft"
                          equipmentKind="aircraft"
                          value={field.value ?? ""}
                          onValuePickAction={field.onChange}
                          onBlur={field.onBlur}
                          disabled={fieldLocked}
                          placeholder="Search or enter aircraft…"
                          aria-invalid={!!errors.aircraft}
                        />
                      )}
                    />
                  </div>
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
                <div className="min-w-0 flex-1">
                  <Controller
                    name="additionalEngine"
                    control={control}
                    render={({ field }) => (
                      <SearchableEquipmentCombobox
                        id="additionalEngine"
                        equipmentKind="engine"
                        value={field.value ?? ""}
                        onValuePickAction={field.onChange}
                        onBlur={field.onBlur}
                        disabled={fieldLocked}
                        placeholder="Search or enter engine…"
                      />
                    )}
                  />
                </div>
              </div>
              <div className="flex min-w-0 flex-row items-center gap-3">
                <Label
                  htmlFor="additionalPropeller"
                  className="w-32 shrink-0 text-sm font-medium text-muted-foreground"
                >
                  Propeller
                </Label>
                <div className="min-w-0 flex-1">
                  <Controller
                    name="additionalPropeller"
                    control={control}
                    render={({ field }) => (
                      <SearchableEquipmentCombobox
                        id="additionalPropeller"
                        equipmentKind="propeller"
                        value={field.value ?? ""}
                        onValuePickAction={field.onChange}
                        onBlur={field.onBlur}
                        disabled={fieldLocked}
                        placeholder="Search or enter propeller…"
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          {!mentorMode && (isNewEntry || isStudentEditor) && (
            <div className="space-y-3 border-t border-border pt-6 mt-4">
              {mentorCtxLoading ? (
                <p className="text-xs text-muted-foreground">Loading mentor information…</p>
              ) : mentorCtx && "error" in mentorCtx ? (
                <p className="text-sm text-destructive">{mentorCtx.error}</p>
              ) : hasAssignedMentor &&
                mentorCtx &&
                "mentor" in mentorCtx &&
                mentorCtx.mentor ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="assigned-mentor-display">Mentor</Label>
                    <div className="flex min-w-0 items-center gap-2">
                      <Input
                        id="assigned-mentor-display"
                        readOnly
                        disabled
                        value={formatMechanicDisplayLine(mentorCtx.mentor)}
                        className="min-w-0 flex-1 bg-muted"
                      />
                      {mentorCtx.mentor.visible === false ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          title="Remove external mentor"
                          aria-label="Remove external mentor"
                          onClick={() => {
                            setMentorActionError(null);
                            setRemoveExternalMentorOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This mentor is saved on your profile. Certified entries use them for notification (if they
                      are a directory user) or automatic sign-off (external / invisible mentors).
                    </p>
                    {mentorActionError ? (
                      <p className="text-sm text-destructive">{mentorActionError}</p>
                    ) : null}
                  </div>

                  <Dialog open={removeExternalMentorOpen} onOpenChange={setRemoveExternalMentorOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Remove external mentor?</DialogTitle>
                        <DialogDescription>
                          They will no longer be used for logbook sign-off or notifications. You can assign another
                          mentor when you add or edit a certified entry.
                        </DialogDescription>
                      </DialogHeader>
                      <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={mentorRemoveBusy}
                          onClick={() => setRemoveExternalMentorOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          disabled={mentorRemoveBusy}
                          onClick={async () => {
                            setMentorRemoveBusy(true);
                            setMentorActionError(null);
                            try {
                              const res = await clearInvisibleAssignedMentorAction();
                              if ("error" in res) {
                                setMentorActionError(res.error);
                                return;
                              }
                              setRemoveExternalMentorOpen(false);
                              const ctx = await getLogbookMentorContext();
                              setMentorCtx(ctx);
                              if (!("error" in ctx) && (!ctx.hasAssignedMentor || !ctx.mentor)) {
                                setMentorSigningEnabled(false);
                                setSelectedMentorUserId(null);
                                setMentorFirstName("");
                                setMentorLastName("");
                                setMentorCertNumber("");
                                setMentorCertType("A&P");
                                setMentorSearchRows([]);
                                setCertNumberTaken(null);
                                setCertTakenChecking(false);
                              }
                              router.refresh();
                            } finally {
                              setMentorRemoveBusy(false);
                            }
                          }}
                        >
                          {mentorRemoveBusy ? "Removing…" : "Remove mentor"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="shrink-0 inline-flex"
                      title="Turn off to certify without a signature or mentor notification (one-time for this entry unless you add a mentor below)."
                    >
                      <Switch
                        id="mentor-signing-switch"
                        checked={mentorSigningEnabled}
                        onCheckedChange={(v) => {
                          setMentorSigningEnabled(v);
                          setMentorActionError(null);
                        }}
                      />
                    </span>
                    <Label htmlFor="mentor-signing-switch" className="text-sm font-normal cursor-pointer">
                      Include mentor signature
                    </Label>
                  </div>

                  {mentorSigningEnabled ? (
                    <div className="space-y-3 border-t border-border/60 pt-3">
                      <div className="flex w-full min-w-0 flex-nowrap items-end gap-2">
                        <div className="min-w-0 flex-1 basis-0">
                          <Label htmlFor="mentor-fn" className="sr-only">
                            Mentor first name
                          </Label>
                          <Input
                            id="mentor-fn"
                            value={mentorFirstName}
                            onChange={(e) => {
                              setMentorFirstName(e.target.value);
                              setSelectedMentorUserId(null);
                              setMentorActionError(null);
                            }}
                            autoComplete="off"
                            placeholder="First name"
                          />
                        </div>
                        <div className="min-w-0 flex-1 basis-0">
                          <Label htmlFor="mentor-ln" className="sr-only">
                            Mentor last name
                          </Label>
                          <Input
                            id="mentor-ln"
                            value={mentorLastName}
                            onChange={(e) => {
                              setMentorLastName(e.target.value);
                              setSelectedMentorUserId(null);
                              setMentorActionError(null);
                            }}
                            autoComplete="off"
                            placeholder="Last name"
                          />
                        </div>
                        <Select
                          value={mentorCertType}
                          onValueChange={(v) => {
                            setMentorCertType(v as "A" | "P" | "A&P" | "AME");
                            setMentorActionError(null);
                          }}
                        >
                          <SelectTrigger
                            className="h-10 w-[5.75rem] shrink-0"
                            aria-label="Certificate type"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="A&P">A&amp;P</SelectItem>
                            <SelectItem value="A">A</SelectItem>
                            <SelectItem value="P">P</SelectItem>
                            <SelectItem value="AME">AME</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="min-w-0 flex-[1.25] basis-0">
                          <Label htmlFor="mentor-cert-num" className="sr-only">
                            Mechanic certificate number
                          </Label>
                          <Input
                            id="mentor-cert-num"
                            value={mentorCertNumber}
                            onChange={(e) => {
                              setMentorCertNumber(sanitizeMechanicCertNumberInput(e.target.value));
                              setSelectedMentorUserId(null);
                              setMentorActionError(null);
                            }}
                            autoComplete="off"
                            placeholder="A1234567"
                            maxLength={8}
                            className="w-full min-w-0"
                          />
                        </div>
                      </div>
                      {mentorCertNumber.length > 0 &&
                      mentorSigningEnabled &&
                      !isValidMechanicCertNumber(mentorCertNumber) ? (
                        <p className="text-xs text-destructive">
                          Use one letter (A–Z) and seven digits (8 characters total).
                        </p>
                      ) : null}
                      {mentorSigningEnabled &&
                      !selectedMentorUserId &&
                      isValidMechanicCertNumber(mentorCertNumber) &&
                      certTakenChecking ? (
                        <p className="text-xs text-muted-foreground">Checking certificate number…</p>
                      ) : null}
                      {mentorSigningEnabled &&
                      !selectedMentorUserId &&
                      isValidMechanicCertNumber(mentorCertNumber) &&
                      certNumberTaken === true ? (
                        <p className="text-xs text-destructive">
                          This certificate number is already on file. Choose the matching mentor below or enter a
                          different number.
                        </p>
                      ) : null}

                      {selectedMentorUserId ? (
                        <p className="text-xs text-muted-foreground">
                          The selected mentor will be stored as your mentor for all future log entries until you
                          remove them.
                        </p>
                      ) : null}

                      {mentorSearchLoading ? (
                        <p className="text-xs text-muted-foreground">Searching…</p>
                      ) : mentorSearchRows.length > 0 ? (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Matching users</p>
                          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border/60 bg-background p-1">
                            {mentorSearchRows.map((row) => (
                              <li key={row.id}>
                                <button
                                  type="button"
                                  className={cn(
                                    "w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent",
                                    selectedMentorUserId === row.id && "bg-accent"
                                  )}
                                  onClick={() => {
                                    setSelectedMentorUserId(row.id);
                                    const parts = (row.full_name ?? "").trim().split(/\s+/);
                                    setMentorFirstName(parts[0] ?? "");
                                    setMentorLastName(parts.slice(1).join(" ") ?? "");
                                    if (row.mechanic_certificate_type) {
                                      setMentorCertType(
                                        row.mechanic_certificate_type as "A" | "P" | "A&P" | "AME"
                                      );
                                    }
                                    if (row.mechanic_certificate_number) {
                                      setMentorCertNumber(
                                        sanitizeMechanicCertNumberInput(row.mechanic_certificate_number)
                                      );
                                    }
                                    setMentorActionError(null);
                                  }}
                                >
                                  {formatMechanicDisplayLine(row)}
                                  {row.visible === false ? (
                                    <span className="ml-2 text-[10px] text-muted-foreground">(external)</span>
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {mentorActionError ? (
                        <p className="text-sm text-destructive">{mentorActionError}</p>
                      ) : null}

                      {createMentorEligible ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={mentorCreateBusy}
                          onClick={async () => {
                            setMentorActionError(null);
                            setMentorCreateBusy(true);
                            try {
                              const res = await createInvisibleMechanicMentorAndAssignAction({
                                firstName: mentorFirstName,
                                lastName: mentorLastName,
                                mechanicCertType: mentorCertType,
                                mechanicCertNumber: mentorCertNumber.trim().toUpperCase(),
                              });
                              if (res.error) {
                                setMentorActionError(res.error);
                                return;
                              }
                              const ctx = await getLogbookMentorContext();
                              setMentorCtx(ctx);
                              if ("mentor" in ctx && ctx.mentor) {
                                setSelectedMentorUserId(ctx.mentor.id);
                                setMentorSigningEnabled(true);
                              }
                            } finally {
                              setMentorCreateBusy(false);
                            }
                          }}
                        >
                          {mentorCreateBusy ? "Creating…" : "Create Mentor"}
                        </Button>
                      ) : null}
                      {createMentorEligible ? (
                        <p className="text-xs text-muted-foreground">
                          Create Mentor creates an account for a person not in our system yet that will be stored
                          as your mentor for all future log entries until you remove them.
                        </p>
                      ) : showMentorNoMatchesHint ? (
                        <p className="text-xs text-muted-foreground">No matching mentors found</p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

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
                          {viewMeta.signatureText
                            ? viewMeta.signatureText
                            : viewMeta.approverName && viewMeta.approvedAt
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
                    By checking this box, you confirm the work described was performed and the hours are
                    accurate. If mentor signing is on, we notify your mentor (for directory users) or
                    record an automatic signature (external mentors), depending on your mentor profile.
                    With signing off, no mentor is notified and there is no signature line.
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
              <Button type="submit" disabled={isSubmitting || !canSubmitForm}>
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
