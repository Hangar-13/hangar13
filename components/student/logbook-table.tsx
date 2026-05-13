"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Clock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUiDate } from "@/lib/format-ui-date";
import { AddEntryModal, type AtaChapterOption } from "./add-entry-modal";

export interface LogbookEntry {
  id: string;
  entry_date: string;
  hours_worked: number;
  description: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  category?: string | null;
  skills_practiced?: string[] | null;
  reject_reason?: string | null;
  log_page_number?: number | null;
  aircraft?: string | null;
  additional_information?: unknown;
}

interface LogbookTableProps {
  entries: LogbookEntry[];
  runningTotal: number;
  ataChapters: AtaChapterOption[];
  acsCodesByEntry?: Record<string, string[]>;
  initialOpenEntryId?: string;
  defaultOpenAddModal?: boolean;
}

export function LogbookTable({ entries, runningTotal, ataChapters, acsCodesByEntry = {}, initialOpenEntryId, defaultOpenAddModal }: LogbookTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [chapterFilter, setChapterFilter] = useState<string>("all");
  const [selectedEntry, setSelectedEntry] = useState<LogbookEntry | null>(null);

  // Open modal for specific entry when navigating from notification
  useEffect(() => {
    if (initialOpenEntryId && entries.length > 0) {
      const entry = entries.find((e) => e.id === initialOpenEntryId);
      if (entry) {
        setSelectedEntry(entry);
      }
    }
  }, [initialOpenEntryId, entries]);

  // Extract ATA chapters from entry (a log can reference multiple chapters)
  const extractATAChapters = (entry: LogbookEntry): string[] => {
    if (entry.category) return [entry.category];
    if (entry.skills_practiced && entry.skills_practiced.length > 0) {
      return entry.skills_practiced
        .map((s) => s?.match(/ATA:\s*(.+)/)?.[1])
        .filter((c): c is string => !!c);
    }
    return [];
  };

  const uniqueChapters = Array.from(
    new Set(entries.flatMap(extractATAChapters))
  );

  // Filter entries
  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      searchQuery === "" ||
      entry.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === "all" || entry.status === statusFilter;
    const entryChapters = extractATAChapters(entry);
    const matchesChapter =
      chapterFilter === "all" || entryChapters.includes(chapterFilter);
    return matchesSearch && matchesStatus && matchesChapter;
  });

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

  // Format ATA chapter for display
  const formatATA = (ata: string | null | undefined) => {
    if (!ata) return "—";
    // If it already includes the format "00 - General", return as-is
    if (ata.includes(" - ")) return ata;
    // Otherwise, try to extract and format
    const match = ata.match(/(\d+)/);
    if (match) {
      return ata; // Return as-is if it looks like "00 - General"
    }
    return ata;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Pending Signature</SelectItem>
            <SelectItem value="approved">Signed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={chapterFilter} onValueChange={setChapterFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All Chapters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Chapters</SelectItem>
            {uniqueChapters.map((chapter) => (
              <SelectItem key={chapter} value={chapter}>
                {formatATA(chapter)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="bg-card">
        <CardHeader>
          <CardTitle>Logbook Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-sm font-semibold">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold">Task</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold">Hours</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold">ATA Chapter</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold">ACS</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      No entries found.
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry) => {
                    const status = getStatusDisplay(entry.status);
                    // Extract task description (remove [entryType] prefix if present)
                    const taskDescription = entry.description.replace(/^\[.*?\]\s*/, "");
                    
                    return (
                      <tr 
                        key={entry.id} 
                        className="border-b hover:bg-accent/50 transition-colors cursor-pointer"
                        onClick={() => setSelectedEntry(entry)}
                      >
                        <td className="py-3 px-4 text-sm">{formatUiDate(entry.entry_date)}</td>
                        <td className="py-3 px-4 text-sm font-medium">{taskDescription}</td>
                        <td className="py-3 px-4 text-sm text-[#0098C7] font-semibold">
                          {entry.hours_worked}h
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground">
                          {extractATAChapters(entry).map((c) => formatATA(c)).join(", ") || "—"}
                        </td>
                        <td className="py-3 px-4 text-sm">
                          {(() => {
                            const acsCodes = acsCodesByEntry[entry.id] ?? [];
                            const count = acsCodes.length;
                            return count > 0 ? (
                              <span
                                className="cursor-default underline decoration-dotted decoration-muted-foreground"
                                title={acsCodes.join("\n")}
                              >
                                {count}
                              </span>
                            ) : (
                              "—"
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full",
                              status.color
                            )}
                          >
                            <Clock className="h-3 w-3" />
                            {status.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Bottom actions: Add Entry + Running Total */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <AddEntryModal
          ataChapters={ataChapters}
          defaultOpen={defaultOpenAddModal}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          }
        />
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm font-medium w-fit">
          <Clock className="h-4 w-4" />
          <span>Running Total: {runningTotal} hours</span>
        </div>
      </div>

      {/* Modal for selected entry - controlled open state, no trigger (opened by row click) */}
      <AddEntryModal
        ataChapters={ataChapters}
        entry={selectedEntry || undefined}
        onSuccess={() => setSelectedEntry(null)}
        open={!!selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
        hideTrigger
      />
    </div>
  );
}
