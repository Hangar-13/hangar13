"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronRight, PenLine } from "lucide-react";
import { AtaChapterCoverage, type AtaChapterItem } from "./ata-chapter-coverage";
import { getAcsCodesByChapter, getAllAcsCodesWithChapters, signAcsCode } from "@/app/actions/acs-codes";
import { AddEntryModal } from "./add-entry-modal";
import { cn } from "@/lib/utils";
import type { ProgressData } from "@/app/actions/progress";
import type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";
import { CertificationAcsProgressBars } from "./certification-acs-progress-bars";

interface CertificationAcsProgressProps {
  progressData: ProgressData;
  ataChapters: AtaChapterItem[];
  progressStats: AcsCertificationProgressStats;
  mentorMode?: boolean;
}

export function CertificationAcsProgress({
  progressData,
  ataChapters,
  progressStats,
  mentorMode = false,
}: CertificationAcsProgressProps) {
  const {
    ataChapterHours,
    acsCoverageByChapter = {},
    entriesByAcsCode = {},
    acsSignoffs = {},
    logbookEntries,
  } = progressData;

  const router = useRouter();
  const [expandedAcsId, setExpandedAcsId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ProgressData["logbookEntries"][0] | null>(null);
  const [acsCodesForChapter, setAcsCodesForChapter] = useState<
    Array<{ id: number; code: string; description: string; ata_chapter_numbers?: string[] }>
  >([]);
  const [acsPage, setAcsPage] = useState(1);
  const [pendingSignAcs, setPendingSignAcs] = useState<{ id: number; code: string; description: string } | null>(
    null
  );
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const [showAllAcsCodes, setShowAllAcsCodes] = useState(false);

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
  }, [selectedChapter, showAllAcsCodes]);

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
          <h4 className="text-sm font-semibold text-foreground">
            {showAllAcsCodes
              ? "ACS codes for all chapters"
              : selectedChapter
                ? `ACS codes for ${ataChaptersMap[selectedChapter] ?? `ATA ${selectedChapter}`}`
                : "ACS codes"}
          </h4>
          <div>
            {showAllAcsCodes || selectedChapter ? (
              acsCodesForChapter.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading ACS codes...</p>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-white divide-y divide-border/60">
                    {acsCodesForChapter
                      .slice((acsPage - 1) * ACS_PER_PAGE, acsPage * ACS_PER_PAGE)
                      .map((acs) => {
                        const acsLogs = entriesByAcsCode[acs.id] ?? [];
                        const signoff = acsSignoffs[acs.id];
                        const isExpanded = expandedAcsId === acs.id;
                        const hasLogs = acsLogs.length > 0;
                        return (
                          <div key={acs.id}>
                            <div
                              className={cn(
                                "flex items-center gap-4 px-4 py-3 transition-colors",
                                hasLogs && "cursor-pointer hover:bg-secondary/10",
                                isExpanded && "bg-secondary/5"
                              )}
                              onClick={() => hasLogs && setExpandedAcsId((prev) => (prev === acs.id ? null : acs.id))}
                            >
                              <div className="w-6 flex-shrink-0">
                                {hasLogs ? (
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
                                    title={`Signed by ${signoff.signer_full_name} on ${new Date(signoff.signed_at).toLocaleDateString("en-US", {
                                      month: "2-digit",
                                      day: "2-digit",
                                      year: "numeric",
                                    })}`}
                                  >
                                    Signed by {signoff.signer_initials}
                                    <br />
                                    on{" "}
                                    {new Date(signoff.signed_at).toLocaleDateString("en-US", {
                                      month: "2-digit",
                                      day: "2-digit",
                                      year: "2-digit",
                                    })}
                                  </span>
                                ) : mentorMode && progressData.apprentice?.id && progressData.apprentice?.user_id ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPendingSignAcs(acs);
                                      setSignError(null);
                                    }}
                                  >
                                    <PenLine className="h-3 w-3 mr-1" />
                                    Sign
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                            {isExpanded && hasLogs && (
                              <div className="ml-10 pl-4 py-2 border-l-2 border-l-secondary bg-secondary/5">
                                <div className="space-y-0">
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
                                        {new Date(entry.entry_date).toLocaleDateString("en-US", {
                                          month: "2-digit",
                                          day: "2-digit",
                                          year: "2-digit",
                                        })}
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
                  {acsCodesForChapter.length > ACS_PER_PAGE && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Page {acsPage} of {Math.ceil(acsCodesForChapter.length / ACS_PER_PAGE)} (
                        {acsCodesForChapter.length} codes)
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
                              Math.min(Math.ceil(acsCodesForChapter.length / ACS_PER_PAGE), p + 1)
                            )
                          }
                          disabled={acsPage >= Math.ceil(acsCodesForChapter.length / ACS_PER_PAGE)}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
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
          viewOnly={selectedEntry.status !== "draft" && selectedEntry.status !== "rejected"}
          open={!!selectedEntry}
          onOpenChange={(open) => {
            if (!open) setSelectedEntry(null);
          }}
          onSuccess={() => setSelectedEntry(null)}
        />
      )}

      <Dialog open={!!pendingSignAcs} onOpenChange={(open) => !open && setPendingSignAcs(null)}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Sign ACS code</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign this ACS code? This certifies that the apprentice has demonstrated
              competency.
            </DialogDescription>
          </DialogHeader>
          {pendingSignAcs && (
            <div className="space-y-2 py-2">
              <p className="font-medium text-sm">{pendingSignAcs.code}</p>
              <p className="text-sm text-muted-foreground">{pendingSignAcs.description || "—"}</p>
            </div>
          )}
          {signError && <p className="text-sm text-destructive">{signError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPendingSignAcs(null);
                setSignError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={signing}
              onClick={async () => {
                if (!pendingSignAcs || !progressData.apprentice?.id || !progressData.apprentice?.user_id) return;
                setSigning(true);
                setSignError(null);
                const result = await signAcsCode({
                  acsCodeId: pendingSignAcs.id,
                  acsCode: pendingSignAcs.code,
                  acsDescription: pendingSignAcs.description || "",
                  apprenticeUserId: progressData.apprentice.user_id,
                  userTrainingId: progressData.apprentice.id,
                });
                setSigning(false);
                if (result.error) {
                  setSignError(result.error);
                  return;
                }
                setPendingSignAcs(null);
                router.refresh();
              }}
            >
              {signing ? "Signing…" : "Sign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
