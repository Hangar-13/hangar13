"use client";

import { useEffect, useMemo, useState } from "react";
import type { AtaChapterItem } from "./ata-chapter-coverage";
import { LogbookExportPreview } from "./logbook-export-preview";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExportFormat, ExportReportMode } from "@/lib/certification-export";
import {
  buildLogbookExportReport,
  collectLogbookPropertyValues,
  defaultLogbookExportFileName,
  downloadLogbookExport,
  type LogbookExportEntry,
  type LogbookPropertyFilterType,
} from "@/lib/logbook-export";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentName: string;
  entries: LogbookExportEntry[];
  ataChapters: AtaChapterItem[];
  acsCodesByEntry: Record<string, string[]>;
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

const PROPERTY_TYPE_OPTIONS: {
  value: LogbookPropertyFilterType | "none";
  label: string;
}[] = [
  { value: "none", label: "Any property" },
  { value: "aircraft", label: "Aircraft" },
  { value: "engine", label: "Engine" },
  { value: "propeller", label: "Propeller" },
];

export function LogbookExportModal({
  open,
  onOpenChange,
  studentName,
  entries,
  ataChapters,
  acsCodesByEntry,
}: Props) {
  const [reportMode, setReportMode] = useState<ExportReportMode>("summary");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [fileName, setFileName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedAta, setSelectedAta] = useState<string[]>([]);
  const [propertyType, setPropertyType] = useState<
    LogbookPropertyFilterType | "none"
  >("none");
  const [propertyValue, setPropertyValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setFileName(defaultLogbookExportFileName());
  }, [open]);

  useEffect(() => {
    setPropertyValue("");
  }, [propertyType]);

  const propertyValues =
    propertyType === "none"
      ? []
      : collectLogbookPropertyValues(entries, propertyType);

  const report = useMemo(
    () =>
      buildLogbookExportReport({
        reportMode,
        fileName,
        studentName,
        entries,
        ataChapters,
        acsCodesByEntry,
        filters: {
          dateFrom,
          dateTo,
          ataChapters: selectedAta,
          propertyType: propertyType === "none" ? null : propertyType,
          propertyValue,
        },
      }),
    [
      reportMode,
      fileName,
      studentName,
      entries,
      ataChapters,
      acsCodesByEntry,
      dateFrom,
      dateTo,
      selectedAta,
      propertyType,
      propertyValue,
    ]
  );

  function toggleAtaChapter(chapter: string) {
    setSelectedAta((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter]
    );
  }

  function handleExport() {
    downloadLogbookExport(report, format);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/40 px-6 py-4">
          <DialogTitle>Print report / export data</DialogTitle>
          <DialogDescription>
            Export your logbook as a summary by ATA chapter or a detailed chronological
            listing.
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
            <Label htmlFor="logbook-export-file-name">File name</Label>
            <Input
              id="logbook-export-file-name"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="ojt-logbook"
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
              <Label htmlFor="logbook-export-date-from">Date from</Label>
              <Input
                id="logbook-export-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="logbook-export-date-to">Date to</Label>
              <Input
                id="logbook-export-date-to"
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
              Click to filter by chapter. Leave unselected to include all chapters.
            </p>
            <div className="max-h-36 overflow-y-auto rounded-md bg-muted/20 p-3">
              <div className="flex flex-wrap gap-1">
                {ataChapters.map(({ chapter_number, title }) => {
                  const selected = selectedAta.includes(chapter_number);
                  return (
                    <button
                      key={chapter_number}
                      type="button"
                      title={title}
                      onClick={() => toggleAtaChapter(chapter_number)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded text-xs font-medium transition-colors",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-foreground ring-1 ring-border/60 hover:bg-muted/60"
                      )}
                    >
                      {chapter_number}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logbook-export-property-type">Filter by property</Label>
              <Select
                value={propertyType}
                onValueChange={(value) =>
                  setPropertyType(value as LogbookPropertyFilterType | "none")
                }
              >
                <SelectTrigger id="logbook-export-property-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logbook-export-property-value">Property value</Label>
              <Select
                value={propertyValue || "__any__"}
                onValueChange={(value) =>
                  setPropertyValue(value === "__any__" ? "" : value)
                }
                disabled={propertyType === "none"}
              >
                <SelectTrigger id="logbook-export-property-value">
                  <SelectValue placeholder="Any value" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Any value</SelectItem>
                  {propertyValues.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="max-h-[min(420px,50vh)] overflow-y-auto rounded-md bg-[#F8F9FA] p-3">
              <LogbookExportPreview report={report} format={format} />
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/40 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleExport} disabled={!fileName.trim()}>
            {format === "pdf" ? "Print" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
