"use client";

import { useEffect, useMemo, useState } from "react";
import { getAllAcsCodesWithChapters } from "@/app/actions/acs-codes";
import type { CertificationAward } from "@/app/actions/user-credentials";
import type { ProgressData } from "@/app/actions/progress";
import type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";
import type { Certification } from "@/lib/certification";
import type { AtaChapterItem } from "./ata-chapter-coverage";
import { CertificationExportPreview } from "./certification-export-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { acsCoverageCellClasses } from "@/lib/ata-chapter-coverage-styles";
import {
  buildCertificationExportReport,
  defaultExportFileName,
  downloadCertificationExport,
  type ExportFormat,
  type ExportReportMode,
  type AcsCodeCatalogRow,
} from "@/lib/certification-export";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  currentCertification: Certification | null;
  certificationAwards: CertificationAward[];
  progressData: ProgressData;
  progressStats: AcsCertificationProgressStats;
  ataChapters: AtaChapterItem[];
};

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
];

const REPORT_MODE_OPTIONS: { value: ExportReportMode; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "detailed", label: "Detailed Report" },
];

export function CertificationExportModal({
  open,
  onOpenChange,
  studentName,
  currentCertification,
  certificationAwards,
  progressData,
  progressStats,
  ataChapters,
}: Props) {
  const [reportMode, setReportMode] = useState<ExportReportMode>("summary");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [fileName, setFileName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedAta, setSelectedAta] = useState<string[]>([]);
  const [acsCatalog, setAcsCatalog] = useState<AcsCodeCatalogRow[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFileName(defaultExportFileName(currentCertification));
    setLoadingCatalog(true);
    getAllAcsCodesWithChapters()
      .then((codes) =>
        setAcsCatalog(
          codes.map((c) => ({
            id: c.id,
            code: c.code,
            description: c.description,
            ata_chapter_numbers: c.ata_chapter_numbers,
          }))
        )
      )
      .finally(() => setLoadingCatalog(false));
  }, [open, currentCertification]);

  const report = useMemo(
    () =>
      buildCertificationExportReport({
        reportMode,
        fileName,
        studentName,
        currentCertification,
        certificationAwards,
        progressData,
        progressStats,
        acsCatalog,
        ataChapters,
        filters: {
          dateFrom,
          dateTo,
          ataChapters: selectedAta,
        },
      }),
    [
      reportMode,
      fileName,
      studentName,
      currentCertification,
      certificationAwards,
      progressData,
      progressStats,
      acsCatalog,
      ataChapters,
      dateFrom,
      dateTo,
      selectedAta,
    ]
  );

  function toggleAtaChapter(chapter: string) {
    setSelectedAta((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter]
    );
  }

  function handleExport() {
    downloadCertificationExport(report, format);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/40 px-6 py-4">
          <DialogTitle>Print report / export data</DialogTitle>
          <DialogDescription>
            Build an ACS coverage report with section progress and covered codes by ATA chapter.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label>Report type</Label>
            <div className="grid grid-cols-2 gap-2">
              {REPORT_MODE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="lg"
                  variant={reportMode === opt.value ? "default" : "outline"}
                  className="h-11"
                  onClick={() => setReportMode(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-file-name">File name</Label>
            <Input
              id="export-file-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="acs-coverage-report"
            />
          </div>

          <div className="space-y-2">
            <Label>Export format</Label>
            <div className="flex flex-wrap gap-2">
              {FORMAT_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={format === opt.value ? "default" : "outline"}
                  onClick={() => setFormat(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="export-date-from">Date from</Label>
              <Input
                id="export-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-date-to">Date to</Label>
              <Input
                id="export-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>ATA chapters</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs"
                onClick={() => setSelectedAta([])}
                disabled={selectedAta.length === 0}
              >
                Clear filter
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Colors match ACS coverage on the page. Click to filter export; leave unselected to
              include all chapters.
            </p>
            <div className="max-h-36 overflow-y-auto rounded-md bg-muted/20 p-3">
              <div className="flex flex-wrap gap-1">
                {ataChapters.map(({ chapter_number, title }) => {
                  const coverage = progressData.acsCoverageByChapter[chapter_number] ?? {
                    satisfied: 0,
                    total: 0,
                    satisfiedCodeIds: [],
                  };
                  const selected = selectedAta.includes(chapter_number);
                  return (
                    <button
                      key={chapter_number}
                      type="button"
                      title={title}
                      onClick={() => toggleAtaChapter(chapter_number)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded text-xs font-medium transition-opacity hover:opacity-90",
                        acsCoverageCellClasses(coverage.satisfied, coverage.total, {
                          selected,
                        })
                      )}
                    >
                      {chapter_number}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded border border-gray-300 bg-[#F5F0E8]" />
                No coverage
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded border border-gray-300 bg-[#CC5A2A]" />
                Partial
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block size-3 rounded border border-gray-300 bg-green-500" />
                Complete
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            {loadingCatalog ? (
              <p className="text-sm text-muted-foreground">Loading report preview…</p>
            ) : (
              <div className="max-h-[min(420px,50vh)] overflow-y-auto rounded-md bg-[#F8F9FA] p-3">
                <CertificationExportPreview report={report} format={format} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border/40 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={!fileName.trim() || loadingCatalog}
          >
            {format === "pdf" ? "Print" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
