"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AtaChapterCoverage, type AtaChapterItem } from "./ata-chapter-coverage";
import { getAcsCodesByChapter, getAllAcsCodesWithChapters } from "@/app/actions/acs-codes";
import { AddEntryModal } from "./add-entry-modal";
import { cn } from "@/lib/utils";
import type { ProgressData } from "@/app/actions/progress";
import type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";
import { CertificationAcsProgressBars } from "./certification-acs-progress-bars";
import { formatUiDate } from "@/lib/format-ui-date";

interface CertificationAcsProgressProps {
  progressData: ProgressData;
  ataChapters: AtaChapterItem[];
  progressStats: AcsCertificationProgressStats;
}

function certificationAcsCodeRowMatches(
  acs: { code: string; description: string; ata_chapter_numbers?: string[] },
  q: string
) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const hay = [acs.code, acs.description ?? "", ...(acs.ata_chapter_numbers ?? [])]
    .join(" ")
    .toLowerCase();
  return s.split(/\s+/).every((w) => w.length > 0 && hay.includes(w));
}

export function CertificationAcsProgress({
  progressData,
  ataChapters,
  progressStats,
}: CertificationAcsProgressProps) {
  const {
    ataChapterHours,
    acsCoverageByChapter = {},
    entriesByAcsCode = {},
    acsSignoffs = {},
    logbookEntries,
  } = progressData;

  const [expandedAcsId, setExpandedAcsId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ProgressData["logbookEntries"][0] | null>(null);
  const [acsCodesForChapter, setAcsCodesForChapter] = useState<
    Array<{ id: number; code: string; description: string; ata_chapter_numbers?: string[] }>
  >([]);
  const [acsPage, setAcsPage] = useState(1);
  const [showAllAcsCodes, setShowAllAcsCodes] = useState(false);
  const [acsListSearch, setAcsListSearch] = useState("");

  const ACS_PER_PAGE = 20;

  const defaultChapter = useMemo(() => {
    const withChapter = logbookEntries.filter((e) =>
      e.skills_practiced?.some((s) => s?.match(/ATA:\s*(\d+)\s*-/))
    );
    if (withChapter.length === 0) return Object.keys(ataChapterHours)[0] ?? null;
    const sorted = [...withChapter].sort(
      (a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
    );
    const firstSkill = sorted[0].skills_practiced?.find((s) => s?.match(/ATA:\s*(\d+)\s*-/));
    const match = firstSkill?.match(/ATA:\s*(\d+)\s*-/);
    return match ? match[1] : Object.keys(ataChapterHours)[0] ?? null;
  }, [logbookEntries, ataChapterHours]);

  const [selectedChapter, setSelectedChapter] = useState<string | null>(defaultChapter);

  useEffect(() => {
    if (showAllAcsCodes) {
      getAllAcsCodesWithChapters().then((codes) =>
        setAcsCodesForChapter(
          codes.map((c) => ({
            id: c.id,
            code: c.code,
            description: c.description,
            ata_chapter_numbers: c.ata_chapter_numbers,
          }))
        )
      );
      return;
    }
    if (selectedChapter) {
      getAcsCodesByChapter(selectedChapter).then((codes) =>
        setAcsCodesForChapter(
          codes.map((c) => ({
            id: c.id,
            code: c.code,
            description: c.description,
            ata_chapter_numbers: c.ata_chapter_numbers,
          }))
        )
      );
    } else {
      setAcsCodesForChapter([]);
    }
  }, [selectedChapter, showAllAcsCodes]);

  useEffect(() => {
    setAcsPage(1);
  }, [selectedChapter, showAllAcsCodes, acsListSearch]);

  useEffect(() => {
    setAcsListSearch("");
  }, [selectedChapter, showAllAcsCodes]);

  const filteredAcsCodesForTable = useMemo(
    () => acsCodesForChapter.filter((a) => certificationAcsCodeRowMatches(a, acsListSearch)),
    [acsCodesForChapter, acsListSearch]
  );

  const ataChaptersMap = Object.fromEntries(
    ataChapters.map((c) => [c.chapter_number, `${c.chapter_number} - ${c.title}`])
  );

  return (
    <>
      <div className="space-y-6">
        <CertificationAcsProgressBars stats={progressStats} />
        <div className="space-y-5 border-t border-border/60 pt-5">
        <div className="space-y-3">
          <h4 className="text-base font-semibold tracking-tight text-foreground">ACS code coverage</h4>
          <Button
            type="button"
            variant={showAllAcsCodes ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAllAcsCodes((v) => !v)}
            aria-pressed={showAllAcsCodes}
          >
            Show all ACS codes
          </Button>
        </div>

        <AtaChapterCoverage
          ataChapterHours={ataChapterHours}
          ataChapterData={progressData.ataChapterData}
          ataChapters={ataChapters}
          acsCoverageByChapter={acsCoverageByChapter}
          coverageMode="acs"
          onChapterSelect={(chapter) => {
            setShowAllAcsCodes(false);
            setSelectedChapter(chapter);
          }}
          embedded
          sectionTitle="ATA chapters"
        />

        <hr className="border-border" />

        <div className="space-y-3">
          <div>
            {showAllAcsCodes || selectedChapter ? (
              acsCodesForChapter.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading ACS codes...</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <h4 className="text-sm font-semibold text-foreground leading-none shrink-0">
                      {showAllAcsCodes
                        ? "ACS codes for all chapters"
                        : selectedChapter
                          ? `ACS codes for ${ataChaptersMap[selectedChapter] ?? `ATA ${selectedChapter}`}`
                          : "ACS codes"}
                    </h4>
                    <Input
                      type="search"
                      value={acsListSearch}
                      onChange={(e) => setAcsListSearch(e.target.value)}
                      placeholder="Search by code, description, or ATA…"
                      className="h-8 min-w-0 flex-1 sm:max-w-xs bg-white dark:bg-white"
                      aria-label="Filter ACS codes"
                    />
                  </div>
                  {filteredAcsCodesForTable.length === 0 ? (
                    <p className="text-sm text-muted-foreground pl-0.5">No ACS codes match your search.</p>
                  ) : (
                    <>
                  <div className="rounded-lg border border-border bg-white divide-y divide-border/60">
                    {filteredAcsCodesForTable
                      .slice((acsPage - 1) * ACS_PER_PAGE, acsPage * ACS_PER_PAGE)
                      .map((acs) => {
                        const acsLogs = entriesByAcsCode[acs.id] ?? [];
                        const signoff = acsSignoffs[acs.id];
                        const isExpanded = expandedAcsId === acs.id;
                        const hasLogs = acsLogs.length > 0;
                        const hasRow = hasLogs || !!signoff;
                        return (
                          <div key={acs.id}>
                            <div
                              className={cn(
                                "flex items-center gap-4 px-4 py-3 transition-colors",
                                hasRow && "cursor-pointer hover:bg-secondary/10",
                                isExpanded && "bg-secondary/5"
                              )}
                              onClick={() => hasRow && setExpandedAcsId((prev) => (prev === acs.id ? null : acs.id))}
                            >
                              <div className="w-6 flex-shrink-0">
                                {hasRow ? (
                                  isExpanded ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )
                                ) : null}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="text-sm font-medium w-28 flex-shrink-0">{acs.code}</span>
                                  <span className="text-sm text-muted-foreground truncate">
                                    {acs.description || <span className="italic">—</span>}
                                  </span>
                                  {acs.ata_chapter_numbers && acs.ata_chapter_numbers.length > 0 && (
                                    <span className="text-xs text-muted-foreground/80">
                                      Ch {acs.ata_chapter_numbers.join(", ")}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-sm text-muted-foreground flex-shrink-0">
                                {acsLogs.length} {acsLogs.length === 1 ? "log" : "logs"}
                              </span>
                              <div className="flex-shrink-0 flex justify-end">
                                {signoff ? (
                                  <span
                                    className="inline-block text-xs px-2 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 cursor-default w-fit text-center leading-tight"
                                    title={`Signed by ${signoff.signer_full_name} on ${formatUiDate(signoff.signed_at)}`}
                                  >
                                    Signed by {signoff.signer_initials}
                                    <br />
                                    on{" "}
                                    {formatUiDate(signoff.signed_at)}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {isExpanded && hasRow && (
                              <div className="ml-10 pl-4 py-2 border-l-2 border-l-secondary bg-secondary/5">
                                <div className="space-y-0">
                                  {!hasLogs && signoff && (
                                    <p className="text-sm text-muted-foreground py-2 px-3">
                                      This code is covered by an approved lesson submission (no logbook line tagged to
                                      this code).
                                    </p>
                                  )}
                                  {acsLogs.map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="flex items-center gap-4 py-2 px-3 border-b border-border/40 cursor-pointer hover:bg-secondary/10 last:border-b-0 text-sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const fullEntry = logbookEntries.find((e) => e.id === entry.id);
                                        if (fullEntry) setSelectedEntry(fullEntry);
                                      }}
                                    >
                                      <span className="w-24 flex-shrink-0">
                                        {formatUiDate(entry.entry_date)}
                                      </span>
                                      <span className="flex-1 min-w-0 font-medium truncate">{entry.description}</span>
                                      <span className="w-16 flex-shrink-0">{entry.hours_worked} hrs</span>
                                      <span
                                        className={cn(
                                          "text-xs px-2 py-0.5 rounded flex-shrink-0",
                                          entry.status === "approved" &&
                                            "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                                          entry.status === "submitted" &&
                                            "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                                          entry.status === "draft" &&
                                            "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
                                          entry.status === "rejected" &&
                                            "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                        )}
                                      >
                                        {entry.status === "submitted"
                                          ? "Pending"
                                          : entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {filteredAcsCodesForTable.length > ACS_PER_PAGE && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Page {acsPage} of {Math.ceil(filteredAcsCodesForTable.length / ACS_PER_PAGE)} (
                        {filteredAcsCodesForTable.length} codes)
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAcsPage((p) => Math.max(1, p - 1))}
                          disabled={acsPage <= 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setAcsPage((p) =>
                              Math.min(Math.ceil(filteredAcsCodesForTable.length / ACS_PER_PAGE), p + 1)
                            )
                          }
                          disabled={acsPage >= Math.ceil(filteredAcsCodesForTable.length / ACS_PER_PAGE)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                    </>
                  )}
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Select a chapter above to view its ACS codes.</p>
            )}
          </div>
        </div>
      </div>
      </div>

      {selectedEntry && (
        <AddEntryModal
          ataChapters={ataChapters.map((c) => ({
            value: c.chapter_number,
            label: `${c.chapter_number} - ${c.title}`,
          }))}
          entry={selectedEntry}
          open={!!selectedEntry}
          onOpenChange={(open) => {
            if (!open) setSelectedEntry(null);
          }}
          onSuccess={() => setSelectedEntry(null)}
        />
      )}

    </>
  );
}
