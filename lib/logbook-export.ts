import type { ExportFormat, ExportReportMode } from "@/lib/certification-export";
import type { AtaChapterItem } from "@/components/student/ata-chapter-coverage";
import { parseLogbookAdditionalInformation } from "@/lib/logbook-additional-information";
import { formatUiDate } from "@/lib/format-ui-date";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type LogbookPropertyFilterType = "aircraft" | "engine" | "propeller";

export type LogbookExportFilters = {
  dateFrom: string;
  dateTo: string;
  ataChapters: string[];
  propertyType: LogbookPropertyFilterType | null;
  propertyValue: string;
};

export type LogbookExportEntry = {
  id: string;
  entry_date: string;
  hours_worked: number;
  description: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  category?: string | null;
  skills_practiced?: string[] | null;
  log_page_number?: number | null;
  aircraft?: string | null;
  additional_information?: unknown;
};

export type LogbookExportSummarySection = {
  chapterNumber: string;
  chapterTitle: string;
  chapterLabel: string;
  logCount: number;
  totalHours: number;
};

export type LogbookExportDetailRow = {
  id: string;
  date: string;
  description: string;
  hours: number;
  ataChapters: string[];
  aircraft: string | null;
  engine: string | null;
  propeller: string | null;
  status: string;
  logPageNumber: number | null;
  acsCodes: string[];
};

export type LogbookExportReport = {
  reportMode: ExportReportMode;
  title: string;
  studentName: string;
  generatedAt: string;
  fileName: string;
  filters: LogbookExportFilters;
  totals: {
    logCount: number;
    totalHours: number;
  };
  summarySections: LogbookExportSummarySection[];
  detailedEntries: LogbookExportDetailRow[];
};

const STATUS_LABELS: Record<LogbookExportEntry["status"], string> = {
  draft: "Draft",
  submitted: "Pending Signature",
  approved: "Signed",
  rejected: "Rejected",
};

const UNASSIGNED_CHAPTER = "__unassigned__";

function entryMatchesDateFilter(
  entryDate: string,
  dateFrom: string,
  dateTo: string
): boolean {
  if (dateFrom && entryDate < dateFrom) return false;
  if (dateTo && entryDate > dateTo) return false;
  return true;
}

function matchesAtaFilter(
  chapterNumbers: string[],
  selectedChapters: string[]
): boolean {
  if (selectedChapters.length === 0) return true;
  return chapterNumbers.some((ch) => selectedChapters.includes(ch));
}

export function extractAtaChapterNumbers(entry: LogbookExportEntry): string[] {
  if (entry.category) return [entry.category.split(" - ")[0]?.trim() ?? entry.category];
  if (entry.skills_practiced?.length) {
    return entry.skills_practiced
      .map((s) => {
        const label = s?.match(/ATA:\s*(.+)/)?.[1];
        if (!label) return null;
        return label.split(" - ")[0]?.trim() ?? label;
      })
      .filter((c): c is string => !!c);
  }
  return [];
}

export function extractAtaChapterLabels(entry: LogbookExportEntry): string[] {
  if (entry.category) return [entry.category];
  if (entry.skills_practiced?.length) {
    return entry.skills_practiced
      .map((s) => s?.match(/ATA:\s*(.+)/)?.[1])
      .filter((c): c is string => !!c);
  }
  return [];
}

function getPropertyValue(
  entry: LogbookExportEntry,
  type: LogbookPropertyFilterType
): string {
  if (type === "aircraft") return entry.aircraft?.trim() ?? "";
  const info = parseLogbookAdditionalInformation(entry.additional_information);
  if (type === "engine") return info.engine?.trim() ?? "";
  return info.propeller?.trim() ?? "";
}

export function collectLogbookPropertyValues(
  entries: LogbookExportEntry[],
  type: LogbookPropertyFilterType
): string[] {
  const values = new Set<string>();
  for (const entry of entries) {
    const value = getPropertyValue(entry, type);
    if (value) values.add(value);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function entryMatchesFilters(
  entry: LogbookExportEntry,
  filters: LogbookExportFilters
): boolean {
  if (
    !entryMatchesDateFilter(entry.entry_date, filters.dateFrom, filters.dateTo)
  ) {
    return false;
  }

  const chapters = extractAtaChapterNumbers(entry);
  if (!matchesAtaFilter(chapters, filters.ataChapters)) {
    return false;
  }

  if (filters.propertyType && filters.propertyValue.trim()) {
    const value = getPropertyValue(entry, filters.propertyType);
    if (
      value.localeCompare(filters.propertyValue.trim(), undefined, {
        sensitivity: "accent",
      }) !== 0
    ) {
      return false;
    }
  }

  return true;
}

function chapterLabelFor(
  chapterNumber: string,
  ataChapterMap: Map<string, string>
): { chapterNumber: string; chapterTitle: string; chapterLabel: string } {
  if (chapterNumber === UNASSIGNED_CHAPTER) {
    return {
      chapterNumber: "",
      chapterTitle: "Unassigned",
      chapterLabel: "Unassigned",
    };
  }
  const title = ataChapterMap.get(chapterNumber) ?? "";
  return {
    chapterNumber,
    chapterTitle: title,
    chapterLabel: title ? `${chapterNumber} — ${title}` : chapterNumber,
  };
}

function buildSummarySections(
  filteredEntries: LogbookExportEntry[],
  ataChapters: AtaChapterItem[]
): LogbookExportSummarySection[] {
  const ataChapterMap = new Map(
    ataChapters.map((c) => [c.chapter_number, c.title])
  );
  const byChapter = new Map<
    string,
    { logCount: number; totalHours: number }
  >();

  for (const entry of filteredEntries) {
    const chapters = extractAtaChapterNumbers(entry);
    const chapterKey = chapters[0] ?? UNASSIGNED_CHAPTER;
    const hours = Number(entry.hours_worked) || 0;
    const existing = byChapter.get(chapterKey) ?? { logCount: 0, totalHours: 0 };
    byChapter.set(chapterKey, {
      logCount: existing.logCount + 1,
      totalHours: existing.totalHours + hours,
    });
  }

  const orderedKeys: string[] = [];
  for (const { chapter_number } of ataChapters) {
    if (byChapter.has(chapter_number)) orderedKeys.push(chapter_number);
  }
  for (const key of byChapter.keys()) {
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
  }
  if (orderedKeys.includes(UNASSIGNED_CHAPTER)) {
    orderedKeys.splice(orderedKeys.indexOf(UNASSIGNED_CHAPTER), 1);
    orderedKeys.push(UNASSIGNED_CHAPTER);
  }

  return orderedKeys.map((chapterNumber) => {
    const stats = byChapter.get(chapterNumber)!;
    const meta = chapterLabelFor(chapterNumber, ataChapterMap);
    return {
      ...meta,
      logCount: stats.logCount,
      totalHours: Math.round(stats.totalHours * 100) / 100,
    };
  });
}

function buildDetailedEntries(
  filteredEntries: LogbookExportEntry[],
  acsCodesByEntry: Record<string, string[]>
): LogbookExportDetailRow[] {
  return [...filteredEntries]
    .sort((a, b) => {
      const dateCmp = a.entry_date.localeCompare(b.entry_date);
      if (dateCmp !== 0) return dateCmp;
      return a.id.localeCompare(b.id);
    })
    .map((entry) => {
      const info = parseLogbookAdditionalInformation(entry.additional_information);
      return {
        id: entry.id,
        date: entry.entry_date,
        description: entry.description.replace(/^\[.*?\]\s*/, ""),
        hours: Number(entry.hours_worked) || 0,
        ataChapters: extractAtaChapterLabels(entry),
        aircraft: entry.aircraft?.trim() || null,
        engine: info.engine?.trim() || null,
        propeller: info.propeller?.trim() || null,
        status: STATUS_LABELS[entry.status],
        logPageNumber: entry.log_page_number ?? null,
        acsCodes: acsCodesByEntry[entry.id] ?? [],
      };
    });
}

export function buildLogbookExportReport(input: {
  reportMode: ExportReportMode;
  fileName: string;
  studentName: string;
  entries: LogbookExportEntry[];
  ataChapters: AtaChapterItem[];
  acsCodesByEntry: Record<string, string[]>;
  filters: LogbookExportFilters;
}): LogbookExportReport {
  const {
    reportMode,
    fileName,
    studentName,
    entries,
    ataChapters,
    acsCodesByEntry,
    filters,
  } = input;

  const filteredEntries = entries.filter((entry) =>
    entryMatchesFilters(entry, filters)
  );

  const totalHours =
    Math.round(
      filteredEntries.reduce(
        (sum, entry) => sum + (Number(entry.hours_worked) || 0),
        0
      ) * 100
    ) / 100;

  const summarySections = buildSummarySections(filteredEntries, ataChapters);
  const detailedEntries = buildDetailedEntries(filteredEntries, acsCodesByEntry);

  const title =
    reportMode === "detailed" ? "OJT Logbook — Detailed Report" : "OJT Logbook — Summary";

  return {
    reportMode,
    title,
    studentName,
    generatedAt: new Date().toISOString(),
    fileName,
    filters,
    totals: {
      logCount: filteredEntries.length,
      totalHours,
    },
    summarySections,
    detailedEntries,
  };
}

export function defaultLogbookExportFileName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `ojt-logbook-${date}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[^\w\-]+/g, "-").replace(/-+/g, "-");
  return trimmed.replace(/^-|-$/g, "") || "ojt-logbook";
}

function fileNameWithExtension(base: string, format: ExportFormat): string {
  const root = sanitizeFileName(base);
  const ext = format === "pdf" ? "pdf" : format === "csv" ? "csv" : "json";
  return root.toLowerCase().endsWith(`.${ext}`) ? root : `${root}.${ext}`;
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function serializeLogbookExportJson(report: LogbookExportReport): string {
  return JSON.stringify(report, null, 2);
}

export function serializeLogbookExportCsv(report: LogbookExportReport): string {
  const rows: string[] = [];
  rows.push("report_mode", csvEscape(report.reportMode));
  rows.push("title", csvEscape(report.title));
  rows.push("student_name", csvEscape(report.studentName));
  rows.push("generated_at", csvEscape(report.generatedAt));
  rows.push("total_logs", csvEscape(report.totals.logCount));
  rows.push("total_hours", csvEscape(report.totals.totalHours));
  rows.push("");

  if (report.reportMode === "summary") {
    rows.push("chapter,chapter_title,log_count,total_hours");
    for (const section of report.summarySections) {
      rows.push(
        [
          csvEscape(section.chapterNumber),
          csvEscape(section.chapterTitle),
          csvEscape(section.logCount),
          csvEscape(section.totalHours),
        ].join(",")
      );
    }
  } else {
    rows.push(
      "date,description,hours,ata_chapters,aircraft,engine,propeller,status,log_page,acs_codes"
    );
    for (const entry of report.detailedEntries) {
      rows.push(
        [
          csvEscape(entry.date),
          csvEscape(entry.description),
          csvEscape(entry.hours),
          csvEscape(entry.ataChapters.join("; ")),
          csvEscape(entry.aircraft),
          csvEscape(entry.engine),
          csvEscape(entry.propeller),
          csvEscape(entry.status),
          csvEscape(entry.logPageNumber),
          csvEscape(entry.acsCodes.join("; ")),
        ].join(",")
      );
    }
  }

  return rows.join("\n");
}

export function downloadLogbookExport(
  report: LogbookExportReport,
  format: ExportFormat
) {
  const filename = fileNameWithExtension(report.fileName, format);

  if (format === "json") {
    const blob = new Blob([serializeLogbookExportJson(report)], {
      type: "application/json;charset=utf-8",
    });
    downloadBlob(blob, filename);
    return;
  }

  if (format === "csv") {
    const blob = new Blob([serializeLogbookExportCsv(report)], {
      type: "text/csv;charset=utf-8",
    });
    downloadBlob(blob, filename);
    return;
  }

  renderLogbookPdf(report, filename);
}

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

function renderLogbookPdf(report: LogbookExportReport, filename: string) {
  const doc = new jsPDF({ unit: "pt", format: "letter" }) as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  const ensureSpace = (needed: number) => {
    const pageHeight = doc.internal.pageSize.getHeight();
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFillColor(255, 207, 3);
  doc.rect(0, 0, pageWidth, 6, "F");

  doc.setTextColor(30, 30, 56);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  const titleLines = doc.splitTextToSize(report.title, contentWidth);
  ensureSpace(titleLines.length * 24 + 40);
  doc.text(titleLines, margin, y + 20);
  y += titleLines.length * 24 + 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(13);
  doc.setTextColor(80, 80, 100);
  doc.text(report.studentName, margin, y + 12);
  y += 28;

  doc.setFontSize(9);
  doc.text(`Generated ${formatUiDate(report.generatedAt)}`, margin, y);
  y += 14;
  doc.text(
    `${report.totals.logCount} logs · ${report.totals.totalHours} hours`,
    margin,
    y
  );
  y += 22;

  if (report.reportMode === "summary") {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["ATA Chapter", "Logs", "Hours"]],
      body: [
        ...report.summarySections.map((section) => [
          section.chapterLabel,
          String(section.logCount),
          `${section.totalHours}h`,
        ]),
        ["Total", String(report.totals.logCount), `${report.totals.totalHours}h`],
      ],
      theme: "grid",
      headStyles: {
        fillColor: [30, 30, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 56] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
    });
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Date", "Task", "Hrs", "ATA", "Status"]],
      body: report.detailedEntries.map((entry) => [
        formatUiDate(entry.date),
        entry.description,
        `${entry.hours}h`,
        entry.ataChapters.join(", ") || "—",
        entry.status,
      ]),
      theme: "striped",
      headStyles: {
        fillColor: [30, 30, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8, textColor: [30, 30, 56] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
      columnStyles: {
        1: { cellWidth: contentWidth * 0.38 },
      },
    });

    y = doc.lastAutoTable?.finalY ?? y;
    y += 24;

    const equipmentRows = report.detailedEntries.filter(
      (entry) => entry.aircraft || entry.engine || entry.propeller
    );
    if (equipmentRows.length > 0) {
      ensureSpace(40);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 56);
      doc.text("Equipment details", margin, y);
      y += 14;

      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["Date", "Aircraft", "Engine", "Propeller"]],
        body: equipmentRows.map((entry) => [
          formatUiDate(entry.date),
          entry.aircraft ?? "—",
          entry.engine ?? "—",
          entry.propeller ?? "—",
        ]),
        theme: "striped",
        headStyles: {
          fillColor: [230, 230, 235],
          textColor: [30, 30, 56],
          fontSize: 8,
        },
        bodyStyles: { fontSize: 8, textColor: [50, 50, 70] },
      });
    }
  }

  doc.save(filename);
}
