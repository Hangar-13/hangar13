"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock,
  Target,
  Award,
  Waves,
  ChevronDown,
  ChevronRight,
  PenLine,
} from "lucide-react";
import { AtaChapterCoverage, type AtaChapterItem } from "./ata-chapter-coverage";
import { getAcsCodesByChapter, signAcsCode } from "@/app/actions/acs-codes";
import { MilestonesTimeline } from "./milestones-timeline";
import { AddEntryModal } from "./add-entry-modal";
import { cn } from "@/lib/utils";

export type CoverageMode = "log" | "acs";

interface ProgressData {
  apprentice: {
    id?: string;
    user_id?: string;
    start_date: string;
  };
  totalHours: number;
  currentWeek: number;
  totalWeeks: number;
  expectedHours: number;
  hoursDifference: number;
  approvedCount: number;
  ataChapterHours: Record<string, number>;
  ataChapterData?: Record<string, { hours: number; status: string }>;
  chaptersWithHours: number;
  acsCoverageByChapter?: Record<string, { satisfied: number; total: number; satisfiedCodeIds: number[] }>;
  entriesByAcsCode?: Record<number, Array<{ id: string; entry_date: string; hours_worked: number; description: string; status: string }>>;
  acsSignoffs?: Record<number, { signed_at: string; signer_initials: string; signer_full_name: string }>;
  logbookEntries: Array<{
    id: string;
    entry_date: string;
    hours_worked: number;
    description: string;
    skills_practiced?: string[] | null;
    status: string;
    reject_reason?: string | null;
  }>;
}

interface ProgressTrackingDashboardProps {
  progressData: ProgressData;
  ataChapters: AtaChapterItem[];
  /** When true, mentor can sign unsigned ACS codes */
  mentorMode?: boolean;
}

export function ProgressTrackingDashboard({
  progressData,
  ataChapters,
  mentorMode = false,
}: ProgressTrackingDashboardProps) {
  const {
    totalHours,
    currentWeek,
    totalWeeks,
    expectedHours,
    hoursDifference,
    approvedCount,
    ataChapterHours,
    chaptersWithHours,
    acsCoverageByChapter = {},
    entriesByAcsCode = {},
    acsSignoffs = {},
    logbookEntries,
  } = progressData;

  const router = useRouter();
  const searchParams = useSearchParams();
  const coverageFromUrl = searchParams?.get("coverage");
  const [coverageMode, setCoverageMode] = useState<CoverageMode>(
    coverageFromUrl === "acs" ? "acs" : "log"
  );
  const [expandedAcsId, setExpandedAcsId] = useState<number | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ProgressData["logbookEntries"][0] | null>(null);
  const [acsCodesForChapter, setAcsCodesForChapter] = useState<Array<{ id: number; code: string; description: string }>>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [acsPage, setAcsPage] = useState(1);
  const [pendingSignAcs, setPendingSignAcs] = useState<{ id: number; code: string; description: string } | null>(null);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const LOGS_PER_PAGE = 20;
  const ACS_PER_PAGE = 20;

  // Default to chapter with most recent log (a log can reference multiple chapters)
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
    if (coverageMode === "acs" && selectedChapter) {
      getAcsCodesByChapter(selectedChapter).then((codes) =>
        setAcsCodesForChapter(codes.map((c) => ({ id: c.id, code: c.code, description: c.description })))
      );
    } else {
      setAcsCodesForChapter([]);
    }
  }, [coverageMode, selectedChapter]);

  useEffect(() => {
    setLogsPage(1);
    setAcsPage(1);
  }, [selectedChapter]);

  // Filter logs for selected chapter (a log can reference multiple chapters)
  const logsForChapter = useMemo(() => {
    if (!selectedChapter) return [];
    return logbookEntries
      .filter((entry) =>
        entry.skills_practiced?.some((skill) => {
          const match = skill?.match(/ATA:\s*(\d+)\s*-/);
          return match && match[1] === selectedChapter;
        })
      )
      .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime());
  }, [logbookEntries, selectedChapter]);

  const targetHours = 5200;
  const percentageComplete = Math.round((currentWeek / totalWeeks) * 100);
  const totalATAChapters = ataChapters.length;
  const ataChaptersMap = Object.fromEntries(
    ataChapters.map((c) => [c.chapter_number, `${c.chapter_number} - ${c.title}`])
  );

  return (
    <div className="space-y-6">
      {/* Overall Program Progress */}
      <Card className="bg-[#6C5067] border-[#6C5067]">
        <CardContent className="p-6 pt-3">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-white">
                Overall Program Progress
              </h2>
              <p className="text-white/80 mt-1">
                Week {currentWeek} of {totalWeeks}
              </p>
            </div>
            <div className="text-3xl font-bold text-white">
              {percentageComplete}% Complete
            </div>
          </div>
          <Progress value={percentageComplete} className="h-3" />
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/25">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Total Hours
                </span>
              </div>
            </div>
            <div className="text-2xl font-bold">{totalHours}</div>
            <div className="text-xs text-muted-foreground mt-1">
              of {targetHours.toLocaleString()} target
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/25">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Waves className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Pace Status
                </span>
              </div>
            </div>
            <div className="text-2xl font-bold">{hoursDifference >= 0 ? "+" : ""}{hoursDifference}h</div>
            <div className="text-xs text-muted-foreground mt-1">
              {hoursDifference < 0 ? "Behind schedule" : "Ahead of schedule"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/25">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  ATA Chapters
                </span>
              </div>
            </div>
            <div className="text-2xl font-bold">{chaptersWithHours}</div>
            <div className="text-xs text-muted-foreground mt-1">
              of {totalATAChapters} covered
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/25">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  Weeks Approved
                </span>
              </div>
            </div>
            <div className="text-2xl font-bold">{approvedCount}</div>
            <div className="text-xs text-muted-foreground mt-1">
              submissions
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Hours Progress Section */}
      <Card className="bg-card/25">
        <CardHeader>
          <CardTitle>Hours Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{totalHours} hours logged</span>
            <span className="text-sm text-muted-foreground">{targetHours.toLocaleString()} target hours</span>
          </div>
          <Progress
            value={Math.min(100, (totalHours / targetHours) * 100)}
            className="h-3"
          />
          <hr className="my-4 border-border" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Expected: </span>
              <span className="font-semibold">{expectedHours}h</span>
            </span>
            <span>
              <span className="text-muted-foreground">Actual: </span>
              <span className="font-semibold">{totalHours}h</span>
            </span>
            <span>
              <span className="text-muted-foreground">Difference: </span>
              <span className={cn(
                "font-semibold",
                hoursDifference >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {hoursDifference >= 0 ? "+" : ""}{hoursDifference}h
              </span>
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Coverage card (Log or ACS mode) */}
      <Card className="bg-card/25">
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>{coverageMode === "log" ? "Log Coverage" : "ACS Code Coverage"}</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCoverageMode((m) => (m === "log" ? "acs" : "log"))}
            >
              {coverageMode === "log" ? "Switch to ACS Codes" : "Switch to Logs"}
            </Button>
          </div>
        </CardHeader>
        <AtaChapterCoverage 
          ataChapterHours={ataChapterHours}
          ataChapterData={progressData.ataChapterData}
          ataChapters={ataChapters}
          acsCoverageByChapter={acsCoverageByChapter}
          coverageMode={coverageMode}
          onChapterSelect={(chapter) => setSelectedChapter(chapter)}
          embedded
          sectionTitle="ATA Chapters"
        />
        <hr className="mx-6 border-border" />
        <div className="space-y-1">
          <div className="px-6 pb-1">
            <CardTitle className="text-sm">
              {selectedChapter
                ? coverageMode === "log"
                  ? `Logs for ${ataChaptersMap[selectedChapter] ?? `ATA ${selectedChapter}`}`
                  : `ACS Codes for ${ataChaptersMap[selectedChapter] ?? `ATA ${selectedChapter}`}`
                : coverageMode === "log"
                  ? "Logs"
                  : "ACS Codes"}
            </CardTitle>
          </div>
          <CardContent className="pt-0">
          {coverageMode === "log" ? (
            selectedChapter && logsForChapter.length === 0 ? (
              <p className="text-sm text-muted-foreground">No logs for this chapter yet.</p>
            ) : selectedChapter && logsForChapter.length > 0 ? (
              <div className="space-y-4">
                <div className="overflow-x-auto rounded-lg border border-border bg-white">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left py-1.5 px-3 text-sm font-semibold w-24 border-r border-border/60">Date</th>
                        <th className="text-left py-1.5 px-3 text-sm font-semibold border-r border-border/60">Description</th>
                        <th className="text-left py-1.5 px-3 text-sm font-semibold w-16 border-r border-border/60">Hours</th>
                        <th className="text-left py-1.5 px-3 text-sm font-semibold w-28">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logsForChapter
                        .slice((logsPage - 1) * LOGS_PER_PAGE, logsPage * LOGS_PER_PAGE)
                        .map((entry) => (
                          <tr
                            key={entry.id}
                            onClick={() => setSelectedEntry(entry)}
                            className="border-b cursor-pointer transition-colors hover:bg-secondary/10 last:border-b-0"
                          >
                            <td className="py-2 px-3 text-sm border-r border-border/60 whitespace-nowrap w-24">
                              {new Date(entry.entry_date).toLocaleDateString("en-US", {
                                month: "2-digit",
                                day: "2-digit",
                                year: "2-digit",
                              })}
                            </td>
                            <td className="py-2 px-3 text-sm font-medium border-r border-border/60">
                              {entry.description}
                            </td>
                            <td className="py-2 px-3 text-sm border-r border-border/60 whitespace-nowrap w-16">
                              {entry.hours_worked}h
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap w-28">
                              <span
                                className={cn(
                                  "text-xs px-2 py-0.5 rounded inline-block",
                                  entry.status === "approved" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                                  entry.status === "submitted" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                                  entry.status === "draft" && "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
                                  entry.status === "rejected" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                )}
                              >
                                {entry.status === "submitted" ? "Pending" : entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {logsForChapter.length > LOGS_PER_PAGE && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Page {logsPage} of {Math.ceil(logsForChapter.length / LOGS_PER_PAGE)} ({logsForChapter.length} logs)
                    </span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                        disabled={logsPage <= 1}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setLogsPage((p) => Math.min(Math.ceil(logsForChapter.length / LOGS_PER_PAGE), p + 1))}
                        disabled={logsPage >= Math.ceil(logsForChapter.length / LOGS_PER_PAGE)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a chapter above to view its logs.</p>
            )
          ) : selectedChapter ? (
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
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium w-28 flex-shrink-0">{acs.code}</span>
                                <span className="text-sm text-muted-foreground truncate">
                                  {acs.description || <span className="italic">—</span>}
                                </span>
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
                                  on {new Date(signoff.signed_at).toLocaleDateString("en-US", {
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
                                        entry.status === "approved" && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
                                        entry.status === "submitted" && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
                                        entry.status === "draft" && "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
                                        entry.status === "rejected" && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                      )}
                                    >
                                      {entry.status === "submitted" ? "Pending" : entry.status.charAt(0).toUpperCase() + entry.status.slice(1)}
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
                      Page {acsPage} of {Math.ceil(acsCodesForChapter.length / ACS_PER_PAGE)} ({acsCodesForChapter.length} codes)
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
                        onClick={() => setAcsPage((p) => Math.min(Math.ceil(acsCodesForChapter.length / ACS_PER_PAGE), p + 1))}
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
          </CardContent>
        </div>
      </Card>

      {/* Milestones */}
      <MilestonesTimeline currentWeek={currentWeek} />

      {/* Modal for selected entry */}
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

      {/* Sign ACS code confirmation dialog */}
      <Dialog open={!!pendingSignAcs} onOpenChange={(open) => !open && setPendingSignAcs(null)}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Sign ACS Code</DialogTitle>
            <DialogDescription>
              Are you sure you want to sign this ACS code? This certifies that the apprentice has demonstrated competency.
            </DialogDescription>
          </DialogHeader>
          {pendingSignAcs && (
            <div className="space-y-2 py-2">
              <p className="font-medium text-sm">{pendingSignAcs.code}</p>
              <p className="text-sm text-muted-foreground">
                {pendingSignAcs.description || "—"}
              </p>
            </div>
          )}
          {signError && (
            <p className="text-sm text-destructive">{signError}</p>
          )}
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
                  apprenticeId: progressData.apprentice.id,
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
    </div>
  );
}
