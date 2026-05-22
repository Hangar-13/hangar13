import type { CertificationAward } from "@/app/actions/user-credentials";
import type { ProgressData } from "@/app/actions/progress";
import type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";
import type { Certification } from "@/lib/certification";
import { certificationProgressTitle } from "@/lib/certification";
import { formatUiDate, formatUiDateTime } from "@/lib/format-ui-date";
import type { AtaChapterItem } from "@/components/student/ata-chapter-coverage";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ExportFormat = "pdf" | "csv" | "json";
export type ExportReportMode = "summary" | "detailed";

export type CertificationExportFilters = {
  dateFrom: string;
  dateTo: string;
  ataChapters: string[];
};

export type AcsCodeCatalogRow = {
  id: number;
  code: string;
  description: string;
  ata_chapter_numbers?: string[];
};

export type ExportAcsLogRow = {
  date: string;
  description: string;
  hours: number;
  status: string;
};

export type ExportAcsCodeRow = {
  code: string;
  description: string;
  signoff: {
    signerFullName: string;
    signerInitials: string;
    signedAt: string;
  } | null;
  logs: ExportAcsLogRow[];
};

export type ExportAtaChapterSection = {
  chapterNumber: string;
  chapterTitle: string;
  chapterLabel: string;
  codesCoveredCount: number;
  codes: ExportAcsCodeRow[];
};

export type CertificationExportReport = {
  reportMode: ExportReportMode;
  title: string;
  studentName: string;
  generatedAt: string;
  fileName: string;
  certificationGoal: string | null;
  filters: CertificationExportFilters;
  progress: {
    overall: {
      signed: number;
      required: number;
      percentage: number;
    };
    domains: AcsCertificationProgressStats["domains"];
  };
  ataChapterSections: ExportAtaChapterSection[];
  certificationAwards: Array<{
    name: string;
    awardedOn: string;
    notes: string | null;
  }>;
};

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

function hasDateFilters(dateFrom: string, dateTo: string): boolean {
  return Boolean(dateFrom || dateTo);
}

function codeActiveInFilterRange(
  acsId: number,
  progressData: ProgressData,
  dateFrom: string,
  dateTo: string
): boolean {
  if (!hasDateFilters(dateFrom, dateTo)) return true;
  const logs = progressData.entriesByAcsCode[acsId] ?? [];
  if (
    logs.some((log) => entryMatchesDateFilter(log.entry_date, dateFrom, dateTo))
  ) {
    return true;
  }
  const signoff = progressData.acsSignoffs[acsId];
  if (
    signoff &&
    entryMatchesDateFilter(signoff.signed_at.slice(0, 10), dateFrom, dateTo)
  ) {
    return true;
  }
  return false;
}

function buildAcsCodeRow(
  acs: AcsCodeCatalogRow,
  progressData: ProgressData,
  dateFrom: string,
  dateTo: string
): ExportAcsCodeRow {
  const rawSignoff = progressData.acsSignoffs[acs.id];
  const signoff = rawSignoff
    ? {
        signerFullName: rawSignoff.signer_full_name,
        signerInitials: rawSignoff.signer_initials,
        signedAt: rawSignoff.signed_at,
      }
    : null;

  const logs = (progressData.entriesByAcsCode[acs.id] ?? [])
    .filter((log) => entryMatchesDateFilter(log.entry_date, dateFrom, dateTo))
    .map((log) => ({
      date: log.entry_date,
      description: log.description.replace(/^\[.*?\]\s*/, ""),
      hours: Number(log.hours_worked) || 0,
      status: log.status,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    code: acs.code,
    description: acs.description,
    signoff,
    logs,
  };
}

export function buildCertificationExportReport(input: {
  reportMode: ExportReportMode;
  fileName: string;
  studentName: string;
  currentCertification: Certification | null;
  certificationAwards: CertificationAward[];
  progressData: ProgressData;
  progressStats: AcsCertificationProgressStats;
  acsCatalog: AcsCodeCatalogRow[];
  ataChapters: AtaChapterItem[];
  filters: CertificationExportFilters;
}): CertificationExportReport {
  const {
    reportMode,
    fileName,
    studentName,
    currentCertification,
    certificationAwards,
    progressData,
    progressStats,
    acsCatalog,
    ataChapters,
    filters,
  } = input;

  const catalogById = new Map(acsCatalog.map((row) => [row.id, row]));

  const ataChapterSections: ExportAtaChapterSection[] = [];

  for (const { chapter_number, title } of ataChapters) {
    if (!matchesAtaFilter([chapter_number], filters.ataChapters)) continue;

    const coverage = progressData.acsCoverageByChapter[chapter_number] ?? {
      satisfied: 0,
      total: 0,
      satisfiedCodeIds: [],
    };

    const coveredCodes: ExportAcsCodeRow[] = [];
    for (const acsId of coverage.satisfiedCodeIds) {
      const acs = catalogById.get(acsId);
      if (!acs) continue;
      if (
        !codeActiveInFilterRange(
          acsId,
          progressData,
          filters.dateFrom,
          filters.dateTo
        )
      ) {
        continue;
      }
      coveredCodes.push(
        buildAcsCodeRow(acs, progressData, filters.dateFrom, filters.dateTo)
      );
    }

    coveredCodes.sort((a, b) => a.code.localeCompare(b.code));

    if (coveredCodes.length === 0) continue;

    ataChapterSections.push({
      chapterNumber: chapter_number,
      chapterTitle: title,
      chapterLabel: `${chapter_number} — ${title}`,
      codesCoveredCount: coveredCodes.length,
      codes: coveredCodes,
    });
  }

  const certTitle = currentCertification
    ? certificationProgressTitle(currentCertification)
    : "Certification";

  return {
    reportMode,
    title: `ACS Coverage toward ${certTitle}`,
    studentName,
    generatedAt: new Date().toISOString(),
    fileName,
    certificationGoal: currentCertification
      ? certificationProgressTitle(currentCertification)
      : null,
    filters,
    progress: {
      overall: {
        signed: progressStats.overall.signed,
        required: progressStats.overall.required,
        percentage: progressStats.overall.percentage,
      },
      domains: progressStats.domains,
    },
    ataChapterSections,
    certificationAwards: certificationAwards.map((row) => ({
      name: row.certification_name,
      awardedOn: row.awarded_on,
      notes: row.notes,
    })),
  };
}

export function defaultExportFileName(cert: Certification | null): string {
  const date = new Date().toISOString().slice(0, 10);
  if (!cert) return `acs-coverage-report-${date}`;
  const slug = certificationProgressTitle(cert)
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/-+/g, "-");
  return `${slug}-acs-coverage-${date}`;
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
  return trimmed.replace(/^-|-$/g, "") || "acs-coverage-report";
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

export function serializeCertificationExportJson(report: CertificationExportReport): string {
  return JSON.stringify(report, null, 2);
}

export function serializeCertificationExportCsv(report: CertificationExportReport): string {
  const rows: string[] = [];
  rows.push("report_mode", csvEscape(report.reportMode));
  rows.push("title", csvEscape(report.title));
  rows.push("student_name", csvEscape(report.studentName));
  rows.push("generated_at", csvEscape(report.generatedAt));
  rows.push(
    "overall_progress",
    csvEscape(
      `${report.progress.overall.percentage}% (${report.progress.overall.signed}/${report.progress.overall.required})`
    )
  );
  for (const domain of report.progress.domains) {
    rows.push(
      `domain_${domain.domain}`,
      csvEscape(`${domain.percentage}% (${domain.signed}/${domain.required})`)
    );
  }
  rows.push("");

  if (report.reportMode === "detailed") {
    rows.push(
      "chapter,chapter_title,codes_covered,code,code_description,log_date,log_description,log_hours,log_status,signer_name,signer_date"
    );
    for (const section of report.ataChapterSections) {
      for (const code of section.codes) {
        if (code.logs.length === 0) {
          rows.push(
            [
              csvEscape(section.chapterNumber),
              csvEscape(section.chapterTitle),
              csvEscape(section.codesCoveredCount),
              csvEscape(code.code),
              csvEscape(code.description),
              "",
              "",
              "",
              "",
              csvEscape(code.signoff?.signerFullName),
              csvEscape(code.signoff?.signedAt),
            ].join(",")
          );
        } else {
          for (const log of code.logs) {
            rows.push(
              [
                csvEscape(section.chapterNumber),
                csvEscape(section.chapterTitle),
                csvEscape(section.codesCoveredCount),
                csvEscape(code.code),
                csvEscape(code.description),
                csvEscape(log.date),
                csvEscape(log.description),
                csvEscape(log.hours),
                csvEscape(log.status),
                csvEscape(code.signoff?.signerFullName),
                csvEscape(code.signoff?.signedAt),
              ].join(",")
            );
          }
        }
      }
    }
  } else {
    rows.push(
      "chapter,chapter_title,codes_covered,code,code_description,signer_name,signer_date"
    );
    for (const section of report.ataChapterSections) {
      for (const code of section.codes) {
        rows.push(
          [
            csvEscape(section.chapterNumber),
            csvEscape(section.chapterTitle),
            csvEscape(section.codesCoveredCount),
            csvEscape(code.code),
            csvEscape(code.description),
            csvEscape(code.signoff?.signerFullName),
            csvEscape(code.signoff?.signedAt),
          ].join(",")
        );
      }
    }
  }

  return rows.join("\n");
}

export function downloadCertificationExport(
  report: CertificationExportReport,
  format: ExportFormat
) {
  const filename = fileNameWithExtension(report.fileName, format);

  if (format === "json") {
    const blob = new Blob([serializeCertificationExportJson(report)], {
      type: "application/json;charset=utf-8",
    });
    downloadBlob(blob, filename);
    return;
  }

  if (format === "csv") {
    const blob = new Blob([serializeCertificationExportCsv(report)], {
      type: "text/csv;charset=utf-8",
    });
    downloadBlob(blob, filename);
    return;
  }

  renderCertificationPdf(report, filename);
}

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

function renderCertificationPdf(report: CertificationExportReport, filename: string) {
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
  y += 18;

  const progressRows = [
    [
      "Overall",
      `${report.progress.overall.percentage}%`,
      `${report.progress.overall.signed} / ${report.progress.overall.required} codes`,
    ],
    ...report.progress.domains.map((d) => [
      d.sectionTitle,
      `${d.percentage}%`,
      `${d.signed} / ${d.required} codes`,
    ]),
  ];

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Section", "Progress", "Signed codes"]],
    body: progressRows,
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

  y = doc.lastAutoTable?.finalY ?? y;
  y += 24;

  for (const section of report.ataChapterSections) {
    ensureSpace(60);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(30, 30, 56);
    doc.text(section.chapterLabel, margin, y);
    y += 16;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 120);
    doc.text(`${section.codesCoveredCount} Codes Covered`, margin, y);
    y += 14;

    if (report.reportMode === "detailed") {
      for (const code of section.codes) {
        ensureSpace(40);
        autoTable(doc, {
          startY: y,
          margin: { left: margin, right: margin },
          head: [["ACS Code", "Description"]],
          body: [[code.code, code.description]],
          theme: "plain",
          headStyles: {
            fillColor: [255, 207, 3],
            textColor: [30, 30, 56],
            fontStyle: "bold",
            fontSize: 8,
          },
          bodyStyles: { fontSize: 9, textColor: [30, 30, 56] },
        });
        y = doc.lastAutoTable?.finalY ?? y;

        const logRows =
          code.logs.length > 0
            ? code.logs.map((log) => [
                formatUiDate(log.date),
                log.description,
                `${log.hours}h`,
                log.status,
              ])
            : [["—", "No logbook entries in selected range", "", ""]];

        autoTable(doc, {
          startY: y + 4,
          margin: { left: margin + 12, right: margin },
          head: [["Date", "Description", "Hours", "Status"]],
          body: logRows,
          theme: "striped",
          headStyles: {
            fillColor: [230, 230, 235],
            textColor: [30, 30, 56],
            fontSize: 8,
          },
          bodyStyles: { fontSize: 8, textColor: [50, 50, 70] },
          alternateRowStyles: { fillColor: [252, 252, 253] },
        });
        y = doc.lastAutoTable?.finalY ?? y;

        if (code.signoff) {
          ensureSpace(16);
          doc.setFontSize(8);
          doc.setTextColor(80, 80, 100);
          doc.text(
            `Signature: ${code.signoff.signerFullName} — ${formatUiDateTime(code.signoff.signedAt)}`,
            margin + 12,
            y + 10
          );
          y += 18;
        }
        y += 10;
      }
    } else {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [["ACS Code", "Description", "Signed by"]],
        body: section.codes.map((code) => [
          code.code,
          code.description,
          code.signoff
            ? `${code.signoff.signerFullName} (${formatUiDate(code.signoff.signedAt)})`
            : "—",
        ]),
        theme: "striped",
        headStyles: {
          fillColor: [30, 30, 56],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
        },
        bodyStyles: { fontSize: 9, textColor: [30, 30, 56] },
        alternateRowStyles: { fillColor: [248, 249, 250] },
      });
      y = doc.lastAutoTable?.finalY ?? y;
      y += 20;
    }
  }

  doc.save(filename);
}
