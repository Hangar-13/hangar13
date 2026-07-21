"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Loader2 } from "lucide-react";
import type { AcsCodeWithChapters } from "@/app/actions/acs-codes";
import type { AtaChapter } from "@/app/actions/ata-chapters";
import type {
  PriorOjtAssessmentRow,
  PriorOjtClaimRow,
  PriorOjtProposedEntryRow,
} from "@/app/actions/prior-ojt";
import {
  abandonPriorOjtAssessment,
  acceptAllPriorOjtProposedEntries,
  acceptPriorOjtProposedEntry,
  completePriorOjtAssessmentAndGenerateEntries,
  savePriorOjtClaims,
  startPriorOjtAssessment,
  updatePriorOjtIntro,
  updatePriorOjtProposedEntry,
  updatePriorOjtSelectedDomains,
} from "@/app/actions/prior-ojt";
import type { AcsDomain } from "@/lib/acs-utils";
import {
  ACS_CATEGORY_LABELS,
  ACS_CATEGORY_ORDER,
  PRIOR_OJT_BACKGROUND_LABELS,
  PRIOR_OJT_BACKGROUNDS,
  PRIOR_OJT_EVIDENCE_LABELS,
  PRIOR_OJT_EVIDENCE_TYPES,
  PRIOR_OJT_SECTIONS,
  buildPriorOjtChapterSteps,
  countClaimsByDomain,
  sectionMetaForDomain,
  type PriorOjtBackground,
  type PriorOjtChapterStep,
  type PriorOjtClaimState,
  type PriorOjtEvidenceType,
} from "@/lib/prior-ojt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

type WizardPhase = "intro" | "sections" | "subjects" | "complete" | "review";

type Props = {
  catalog: AcsCodeWithChapters[];
  ataChapters: AtaChapter[];
  initialAssessment: PriorOjtAssessmentRow | null;
  initialClaims: PriorOjtClaimRow[];
  initialProposedEntries: PriorOjtProposedEntryRow[];
  defaultFullName: string;
  defaultEmail: string;
};

function claimsToState(claims: PriorOjtClaimRow[]): PriorOjtClaimState {
  const state: PriorOjtClaimState = {};
  for (const claim of claims) {
    state[claim.acs_code_id] = {
      selected: true,
      evidenceTypes: claim.evidence_types,
    };
  }
  return state;
}

function stateToClaims(state: PriorOjtClaimState) {
  return Object.entries(state)
    .filter(([, v]) => v.selected && v.evidenceTypes.length > 0)
    .map(([id, v]) => ({
      acsCodeId: Number(id),
      evidenceTypes: v.evidenceTypes,
    }));
}

export function PriorOjtWizard({
  catalog,
  ataChapters,
  initialAssessment,
  initialClaims,
  initialProposedEntries,
  defaultFullName,
  defaultEmail,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [assessmentId, setAssessmentId] = useState(initialAssessment?.id ?? null);
  const [fullName, setFullName] = useState(
    initialAssessment?.full_name || defaultFullName
  );
  const [email, setEmail] = useState(initialAssessment?.email || defaultEmail);
  const [backgrounds, setBackgrounds] = useState<PriorOjtBackground[]>(
    (initialAssessment?.backgrounds ?? []).filter((b): b is PriorOjtBackground =>
      (PRIOR_OJT_BACKGROUNDS as readonly string[]).includes(b)
    )
  );
  const [summary, setSummary] = useState(initialAssessment?.summary ?? "");
  const [selectedDomains, setSelectedDomains] = useState<AcsDomain[]>(
    initialAssessment?.selected_domains ?? []
  );
  const [claimState, setClaimState] = useState<PriorOjtClaimState>(() =>
    claimsToState(initialClaims)
  );
  const [proposedEntries, setProposedEntries] = useState(initialProposedEntries);
  const [chapterIndex, setChapterIndex] = useState(0);
  /** ACS code id → ATA chapter number where the user claimed it. */
  const [claimChapters, setClaimChapters] = useState<Record<number, string>>({});

  const allChapters = useMemo(
    () => buildPriorOjtChapterSteps(catalog, ataChapters),
    [catalog, ataChapters]
  );
  const activeChapters = useMemo(
    () => buildPriorOjtChapterSteps(catalog, ataChapters, selectedDomains),
    [catalog, ataChapters, selectedDomains]
  );

  const [chapterHasExperience, setChapterHasExperience] = useState<
    Record<string, boolean | null>
  >(() => {
    const claimedIds = new Set(initialClaims.map((c) => c.acs_code_id));
    const map: Record<string, boolean | null> = {};
    for (const chapter of buildPriorOjtChapterSteps(
      catalog,
      ataChapters,
      initialAssessment?.selected_domains
    )) {
      const anyClaimed = chapter.codes.some((c) => claimedIds.has(c.id));
      if (anyClaimed) map[chapter.key] = true;
    }
    return map;
  });

  const initialPhase = ((): WizardPhase => {
    if (!initialAssessment) return "intro";
    if (
      initialAssessment.status === "reviewing" ||
      initialProposedEntries.some((e) => e.status === "pending")
    ) {
      return "review";
    }
    if (initialAssessment.selected_domains?.length) return "subjects";
    return "sections";
  })();
  const [phase, setPhase] = useState<WizardPhase>(initialPhase);
  const codesById = useMemo(
    () => new Map(catalog.map((c) => [c.id, c])),
    [catalog]
  );

  const claimList = useMemo(() => stateToClaims(claimState), [claimState]);
  const claimedCount = claimList.length;
  const domainCounts = useMemo(
    () => countClaimsByDomain(claimList, codesById),
    [claimList, codesById]
  );

  const currentChapter: PriorOjtChapterStep | null =
    activeChapters[chapterIndex] ?? null;

  const totalWizardSteps = 2 + activeChapters.length + 2; // intro+sections+chapters+complete+review
  const stepNumber =
    phase === "intro"
      ? 1
      : phase === "sections"
        ? 2
        : phase === "subjects"
          ? 3 + chapterIndex
          : phase === "complete"
            ? 2 + activeChapters.length + 1
            : totalWizardSteps;

  function toggleBackground(value: PriorOjtBackground) {
    setBackgrounds((prev) =>
      prev.includes(value) ? prev.filter((b) => b !== value) : [...prev, value]
    );
  }

  function toggleDomain(domain: AcsDomain) {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain]
    );
  }

  function setCodeSelected(codeId: number, selected: boolean) {
    setClaimState((prev) => {
      const existing = prev[codeId];
      if (!selected) {
        const next = { ...prev };
        delete next[codeId];
        return next;
      }
      return {
        ...prev,
        [codeId]: {
          selected: true,
          evidenceTypes: existing?.evidenceTypes ?? [],
        },
      };
    });
    setClaimChapters((prev) => {
      if (!selected) {
        const next = { ...prev };
        delete next[codeId];
        return next;
      }
      if (!currentChapter) return prev;
      return { ...prev, [codeId]: currentChapter.chapterNumber };
    });
  }

  function toggleEvidence(codeId: number, evidence: PriorOjtEvidenceType) {
    setClaimState((prev) => {
      const existing = prev[codeId];
      if (!existing?.selected) return prev;
      const has = existing.evidenceTypes.includes(evidence);
      const evidenceTypes = has
        ? existing.evidenceTypes.filter((e) => e !== evidence)
        : [...existing.evidenceTypes, evidence];
      return {
        ...prev,
        [codeId]: { selected: true, evidenceTypes },
      };
    });
  }

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function handleIntroContinue() {
    run(async () => {
      if (!fullName.trim() || !email.trim()) {
        setError("Name and email are required.");
        return;
      }
      if (assessmentId) {
        const result = await updatePriorOjtIntro(assessmentId, {
          fullName,
          email,
          backgrounds,
          summary,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
      } else {
        const result = await startPriorOjtAssessment({
          fullName,
          email,
          backgrounds,
          summary,
        });
        if (result.error || !result.assessmentId) {
          setError(result.error ?? "Failed to start assessment.");
          return;
        }
        setAssessmentId(result.assessmentId);
      }
      setPhase("sections");
    });
  }

  function handleSectionsContinue() {
    run(async () => {
      if (!assessmentId) {
        setError("Start the assessment first.");
        return;
      }
      if (selectedDomains.length === 0) {
        setError("Select at least one section.");
        return;
      }
      const result = await updatePriorOjtSelectedDomains(
        assessmentId,
        selectedDomains
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setChapterIndex(0);
      setPhase("subjects");
    });
  }

  async function advanceFromChapter(args: {
    hasExperience: boolean;
    claims: PriorOjtClaimState;
    chapters: Record<number, string>;
  }) {
    if (!currentChapter) return;

    let nextClaims = args.claims;
    let nextChapters = args.chapters;

    if (args.hasExperience) {
      const chapterClaims = currentChapter.codes.filter(
        (c) => nextClaims[c.id]?.selected
      );
      const missingEvidence = chapterClaims.some(
        (c) => !(nextClaims[c.id]?.evidenceTypes?.length)
      );
      if (missingEvidence) {
        setError("Select evidence for each claimed ACS code.");
        return;
      }
    } else {
      nextClaims = { ...args.claims };
      nextChapters = { ...args.chapters };
      for (const code of currentChapter.codes) {
        const claimedOnThisChapter =
          nextChapters[code.id] === currentChapter.chapterNumber;
        if (claimedOnThisChapter || nextClaims[code.id]?.selected) {
          // Only clear if claimed on this chapter (or unassigned but selected here)
          if (
            !nextChapters[code.id] ||
            nextChapters[code.id] === currentChapter.chapterNumber
          ) {
            delete nextClaims[code.id];
            delete nextChapters[code.id];
          }
        }
      }
      setClaimState(nextClaims);
      setClaimChapters(nextChapters);
    }

    if (assessmentId) {
      const saveResult = await savePriorOjtClaims(
        assessmentId,
        stateToClaims(nextClaims)
      );
      if (saveResult.error) {
        setError(saveResult.error);
        return;
      }
    }

    if (chapterIndex < activeChapters.length - 1) {
      setChapterIndex((i) => i + 1);
      setError(null);
      return;
    }
    setPhase("complete");
    setError(null);
  }

  function handleChapterContinue() {
    if (!currentChapter) return;
    const hasExp = chapterHasExperience[currentChapter.key];
    if (hasExp === null || hasExp === undefined) {
      setError("Choose Yes or No, skip before continuing.");
      return;
    }
    run(async () => {
      await advanceFromChapter({
        hasExperience: hasExp,
        claims: claimState,
        chapters: claimChapters,
      });
    });
  }

  function handleSkipChapter() {
    if (!currentChapter) return;
    setChapterHasExperience((prev) => ({
      ...prev,
      [currentChapter.key]: false,
    }));
    run(async () => {
      await advanceFromChapter({
        hasExperience: false,
        claims: claimState,
        chapters: claimChapters,
      });
    });
  }

  function handleGenerateReview() {
    run(async () => {
      if (!assessmentId) {
        setError("Assessment missing.");
        return;
      }
      const result = await completePriorOjtAssessmentAndGenerateEntries(
        assessmentId,
        stateToClaims(claimState),
        { claimChapters }
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setProposedEntries(result.proposedEntries ?? []);
      setPhase("review");
    });
  }

  function handleAcceptOne(entryId: string) {
    run(async () => {
      const result = await acceptPriorOjtProposedEntry(entryId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setProposedEntries((prev) =>
        prev.map((e) =>
          e.id === entryId
            ? {
                ...e,
                status: "accepted",
                logbook_entry_id: result.logbookEntryId ?? e.logbook_entry_id,
              }
            : e
        )
      );
      router.refresh();
    });
  }

  function handleAcceptAll() {
    run(async () => {
      if (!assessmentId) return;
      const result = await acceptAllPriorOjtProposedEntries(assessmentId);
      if (result.error) {
        setError(result.error);
        return;
      }
      setProposedEntries((prev) =>
        prev.map((e) =>
          e.status === "pending" ? { ...e, status: "accepted" } : e
        )
      );
      router.push("/dashboard/student/logbook");
    });
  }

  function handleRemoveEntry(entryId: string) {
    run(async () => {
      const result = await updatePriorOjtProposedEntry(entryId, {
        status: "removed",
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setProposedEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: "removed" } : e))
      );
    });
  }

  function handleRestoreEntry(entryId: string) {
    run(async () => {
      const result = await updatePriorOjtProposedEntry(entryId, {
        status: "pending",
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setProposedEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, status: "pending" } : e))
      );
    });
  }

  function handlePatchEntry(
    entryId: string,
    patch: {
      entryDate?: string;
      hoursWorked?: number;
      description?: string;
      ataChapterNumber?: string | null;
    }
  ) {
    run(async () => {
      const result = await updatePriorOjtProposedEntry(entryId, patch);
      if (result.error) {
        setError(result.error);
        return;
      }
      setProposedEntries((prev) =>
        prev.map((e) => {
          if (e.id !== entryId) return e;
          return {
            ...e,
            entry_date: patch.entryDate ?? e.entry_date,
            hours_worked: patch.hoursWorked ?? e.hours_worked,
            description: patch.description ?? e.description,
            ata_chapter_number:
              patch.ataChapterNumber !== undefined
                ? patch.ataChapterNumber
                : e.ata_chapter_number,
          };
        })
      );
    });
  }

  function handleStartOver() {
    run(async () => {
      if (assessmentId) {
        const result = await abandonPriorOjtAssessment(assessmentId);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      setAssessmentId(null);
      setSelectedDomains([]);
      setClaimState({});
      setClaimChapters({});
      setProposedEntries([]);
      setChapterIndex(0);
      setChapterHasExperience({});
      setPhase("intro");
    });
  }

  const progressPct = Math.round((stepNumber / Math.max(totalWizardSteps, 1)) * 100);

  return (
    <div className="flex w-full flex-col gap-4">
      {phase !== "intro" && phase !== "sections" ? (
        <p className="text-xs text-muted-foreground">
          {claimedCount} {claimedCount === 1 ? "item" : "items"} claimed
        </p>
      ) : null}

      <div className="min-h-[28rem]">
        {phase === "intro" ? (
          <IntroStep
            fullName={fullName}
            email={email}
            backgrounds={backgrounds}
            summary={summary}
            onFullName={setFullName}
            onEmail={setEmail}
            onToggleBackground={toggleBackground}
            onSummary={setSummary}
          />
        ) : null}

        {phase === "sections" ? (
          <SectionsStep
            chapters={allChapters}
            selectedDomains={selectedDomains}
            onToggleDomain={toggleDomain}
          />
        ) : null}

        {phase === "subjects" && currentChapter ? (
          <ChapterStep
            chapter={currentChapter}
            chapterIndex={chapterIndex}
            chapterTotal={activeChapters.length}
            hasExperience={chapterHasExperience[currentChapter.key] ?? null}
            claimState={claimState}
            onHasExperience={(value) =>
              setChapterHasExperience((prev) => ({
                ...prev,
                [currentChapter.key]: value,
              }))
            }
            onSkip={handleSkipChapter}
            onSetCodeSelected={setCodeSelected}
            onToggleEvidence={toggleEvidence}
          />
        ) : null}

        {phase === "complete" ? (
          <CompleteStep claimedCount={claimedCount} domainCounts={domainCounts} />
        ) : null}

        {phase === "review" ? (
          <ReviewStep
            entries={proposedEntries}
            ataChapters={ataChapters}
            codesById={codesById}
            pending={pending}
            onPatch={handlePatchEntry}
            onRemove={handleRemoveEntry}
            onRestore={handleRestoreEntry}
            onAcceptOne={handleAcceptOne}
            onAcceptAll={handleAcceptAll}
          />
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <footer className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-3 shadow-sm ring-1 ring-black/[0.04]">
        <Button
          type="button"
          variant="ghost"
          disabled={pending || phase === "intro"}
          onClick={() => {
            setError(null);
            if (phase === "sections") setPhase("intro");
            else if (phase === "subjects") {
              if (chapterIndex === 0) setPhase("sections");
              else setChapterIndex((i) => i - 1);
            } else if (phase === "complete") {
              setPhase("subjects");
              setChapterIndex(Math.max(0, activeChapters.length - 1));
            } else if (phase === "review") setPhase("complete");
          }}
        >
          Back
        </Button>

        <span className="text-xs tabular-nums text-muted-foreground">
          {stepNumber} of {totalWizardSteps}
        </span>

        {phase === "intro" ? (
          <Button type="button" disabled={pending} onClick={handleIntroContinue}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Continue
          </Button>
        ) : null}
        {phase === "sections" ? (
          <Button type="button" disabled={pending} onClick={handleSectionsContinue}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Continue
          </Button>
        ) : null}
        {phase === "subjects" ? (
          <Button type="button" disabled={pending} onClick={handleChapterContinue}>
            Continue
          </Button>
        ) : null}
        {phase === "complete" ? (
          <Button type="button" disabled={pending} onClick={handleGenerateReview}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            Review log entries
          </Button>
        ) : null}
        {phase === "review" ? (
          <Button type="button" variant="secondary" asChild>
            <Link href="/dashboard/student/skills">Done</Link>
          </Button>
        ) : null}
      </footer>

      <Progress value={progressPct} className="h-1.5 w-full" />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <Link
          href="/dashboard/student/skills"
          className="text-primary underline underline-offset-4"
        >
          Back to Skills profile
        </Link>
        {assessmentId ? (
          <button
            type="button"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            disabled={pending}
            onClick={handleStartOver}
          >
            Start over
          </button>
        ) : null}
      </div>
    </div>
  );
}

function IntroStep({
  fullName,
  email,
  backgrounds,
  summary,
  onFullName,
  onEmail,
  onToggleBackground,
  onSummary,
}: {
  fullName: string;
  email: string;
  backgrounds: PriorOjtBackground[];
  summary: string;
  onFullName: (v: string) => void;
  onEmail: (v: string) => void;
  onToggleBackground: (v: PriorOjtBackground) => void;
  onSummary: (v: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#0f2744]">
          Let&apos;s assess your prior experience
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This takes 5–15 minutes depending on your background. We&apos;ll turn your
          answers into draft logbook entries you can review before they become part of
          your OJT logbook.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prior-ojt-name">Full name *</Label>
          <Input
            id="prior-ojt-name"
            value={fullName}
            onChange={(e) => onFullName(e.target.value)}
            placeholder="Jane Smith"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="prior-ojt-email">Email *</Label>
          <Input
            id="prior-ojt-email"
            type="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="jane@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label>My background includes</Label>
          <div className="flex flex-wrap gap-2">
            {PRIOR_OJT_BACKGROUNDS.map((key) => {
              const active = backgrounds.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onToggleBackground(key)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted/50"
                  )}
                >
                  {PRIOR_OJT_BACKGROUND_LABELS[key]}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="prior-ojt-summary">Brief summary (optional)</Label>
          <Textarea
            id="prior-ojt-summary"
            value={summary}
            onChange={(e) => onSummary(e.target.value)}
            placeholder="e.g. 6 years Army 15T helicopter mechanic, worked on Black Hawks and Chinooks..."
            rows={4}
          />
        </div>
      </div>
    </div>
  );
}

function SectionsStep({
  chapters,
  selectedDomains,
  onToggleDomain,
}: {
  chapters: PriorOjtChapterStep[];
  selectedDomains: AcsDomain[];
  onToggleDomain: (domain: AcsDomain) => void;
}) {
  const counts = useMemo(() => {
    const map: Record<AcsDomain, number> = {
      general: 0,
      airframe: 0,
      powerplant: 0,
    };
    for (const chapter of chapters) {
      const seen = new Set<AcsDomain>();
      for (const code of chapter.codes) seen.add(code.domain);
      for (const domain of seen) map[domain] += 1;
    }
    return map;
  }, [chapters]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Step 1
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-[#0f2744]">
          Which areas have you worked in?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Select all that apply. We&apos;ll only ask about the ATA chapters linked to
          ACS codes in the sections you choose.
        </p>
      </div>

      <div className="space-y-3">
        {PRIOR_OJT_SECTIONS.map((section) => {
          const checked = selectedDomains.includes(section.domain);
          return (
            <button
              key={section.domain}
              type="button"
              onClick={() => onToggleDomain(section.domain)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-4 py-4 text-left transition-colors",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/30"
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-muted-foreground/40"
                )}
              >
                {checked ? <Check className="h-3.5 w-3.5" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      section.badgeClass
                    )}
                  >
                    Section {section.roman}
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {section.shortLabel}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {counts[section.domain]} ATA chapters
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{section.blurb}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChapterStep({
  chapter,
  chapterIndex,
  chapterTotal,
  hasExperience,
  claimState,
  onHasExperience,
  onSkip,
  onSetCodeSelected,
  onToggleEvidence,
}: {
  chapter: PriorOjtChapterStep;
  chapterIndex: number;
  chapterTotal: number;
  hasExperience: boolean | null;
  claimState: PriorOjtClaimState;
  onHasExperience: (value: boolean) => void;
  onSkip: () => void;
  onSetCodeSelected: (codeId: number, selected: boolean) => void;
  onToggleEvidence: (codeId: number, evidence: PriorOjtEvidenceType) => void;
}) {
  const meta = sectionMetaForDomain(chapter.domain);
  const byCategory = ACS_CATEGORY_ORDER.map((category) => ({
    category,
    codes: chapter.codes.filter((c) => c.category === category),
  })).filter((g) => g.codes.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            meta.badgeClass
          )}
        >
          Section {meta.roman} · {meta.shortLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {chapterIndex + 1} of {chapterTotal}
        </span>
      </div>

      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#0f2744]">
          ATA {chapter.chapterNumber} — {chapter.title}
        </h2>
        {chapter.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{chapter.description}</p>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            {chapter.codes.length} ACS code{chapter.codes.length === 1 ? "" : "s"}{" "}
            linked to this chapter
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
        <p className="text-sm font-semibold text-foreground">
          Do you have experience in this area?
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => onHasExperience(true)}
            className={cn(
              "rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
              hasExperience === true
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted/40"
            )}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={onSkip}
            className={cn(
              "rounded-lg border px-4 py-3 text-sm font-medium transition-colors",
              hasExperience === false
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-muted/40"
            )}
          >
            No, skip
          </button>
        </div>
      </div>

      {hasExperience ? (
        <div className="space-y-5">
          {byCategory.map(({ category, codes }) => (
            <div key={category} className="space-y-2">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {ACS_CATEGORY_LABELS[category]}
              </p>
              <ul className="space-y-2">
                {codes.map((code) => {
                  const claim = claimState[code.id];
                  const selected = Boolean(claim?.selected);
                  return (
                    <li
                      key={code.id}
                      className={cn(
                        "rounded-lg border px-3 py-2.5",
                        selected ? "border-primary/40 bg-primary/5" : "border-border/70"
                      )}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4 accent-primary"
                          checked={selected}
                          onChange={(e) =>
                            onSetCodeSelected(code.id, e.target.checked)
                          }
                        />
                        <span className="min-w-0">
                          <span className="text-sm font-semibold text-foreground">
                            {code.code}
                          </span>{" "}
                          <span className="text-sm text-muted-foreground">
                            {code.description}
                          </span>
                        </span>
                      </label>
                      {selected ? (
                        <div className="mt-3 pl-7">
                          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                            Evidence
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {PRIOR_OJT_EVIDENCE_TYPES.map((evidence) => {
                              const active =
                                claim?.evidenceTypes.includes(evidence) ?? false;
                              return (
                                <button
                                  key={evidence}
                                  type="button"
                                  onClick={() => onToggleEvidence(code.id, evidence)}
                                  className={cn(
                                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                                    active
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background hover:bg-muted/40"
                                  )}
                                >
                                  {PRIOR_OJT_EVIDENCE_LABELS[evidence]}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompleteStep({
  claimedCount,
  domainCounts,
}: {
  claimedCount: number;
  domainCounts: Record<AcsDomain, number>;
}) {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="h-8 w-8" />
      </div>
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#0f2744]">
          Assessment complete
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Here&apos;s what you&apos;ve claimed. Next we&apos;ll generate draft logbook
          entries so you can edit or remove them before accepting.
        </p>
      </div>

      <p className="text-sm font-medium text-foreground">
        {claimedCount} {claimedCount === 1 ? "item" : "items"} claimed
      </p>

      <div className="grid grid-cols-3 gap-3">
        {PRIOR_OJT_SECTIONS.map((section) => (
          <div
            key={section.domain}
            className="rounded-xl border border-border/70 px-3 py-4"
          >
            <p className="text-xs font-medium text-muted-foreground">
              {section.shortLabel}
            </p>
            <p className={cn("mt-1 text-3xl font-bold tabular-nums", section.accentClass)}>
              {domainCounts[section.domain]}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-4 text-left">
        <p className="text-sm font-semibold text-foreground">What happens next</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Review the draft log entries we generate from your claims.</li>
          <li>Edit hours, dates, descriptions, or ATA chapters as needed.</li>
          <li>Remove any entries you don&apos;t want, or accept them one by one.</li>
          <li>Accept all remaining entries to add them to your OJT logbook as drafts.</li>
        </ol>
      </div>
    </div>
  );
}

function ProposedEntryCard({
  entry,
  ataChapters,
  codesById,
  pending,
  onPatch,
  onRemove,
  onRestore,
  onAcceptOne,
}: {
  entry: PriorOjtProposedEntryRow;
  ataChapters: AtaChapter[];
  codesById: Map<number, AcsCodeWithChapters>;
  pending: boolean;
  onPatch: (
    entryId: string,
    patch: {
      entryDate?: string;
      hoursWorked?: number;
      description?: string;
      ataChapterNumber?: string | null;
    }
  ) => void;
  onRemove: (entryId: string) => void;
  onRestore: (entryId: string) => void;
  onAcceptOne: (entryId: string) => void;
}) {
  const [description, setDescription] = useState(entry.description);
  const [hours, setHours] = useState(String(entry.hours_worked));
  const removed = entry.status === "removed";
  const accepted = entry.status === "accepted";
  const codeLabels = entry.acs_code_ids
    .map((id) => codesById.get(id)?.code)
    .filter(Boolean)
    .join(", ");

  return (
    <li
      className={cn(
        "rounded-xl border p-4",
        removed
          ? "border-border/50 bg-muted/20 opacity-70"
          : accepted
            ? "border-emerald-200 bg-emerald-50/40"
            : "border-border"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {entry.subject ?? "Prior OJT entry"}
          </p>
          {entry.domain ? (
            <p className="text-xs text-muted-foreground">
              {sectionMetaForDomain(entry.domain).title}
            </p>
          ) : null}
        </div>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
          {entry.status}
        </span>
      </div>

      {accepted ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Added to your logbook as a draft entry.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input
              type="date"
              disabled={removed || pending}
              value={entry.entry_date}
              onChange={(e) => onPatch(entry.id, { entryDate: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Hours</Label>
            <Input
              type="number"
              min={0.25}
              step={0.25}
              disabled={removed || pending}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              onBlur={() => {
                const n = Number(hours);
                if (Number.isFinite(n) && n > 0 && n !== entry.hours_worked) {
                  onPatch(entry.id, { hoursWorked: n });
                } else {
                  setHours(String(entry.hours_worked));
                }
              }}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>ATA chapter</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:opacity-50"
              disabled={removed || pending}
              value={entry.ata_chapter_number ?? ""}
              onChange={(e) =>
                onPatch(entry.id, {
                  ataChapterNumber: e.target.value || null,
                })
              }
            >
              <option value="">Select ATA chapter</option>
              {ataChapters.map((ch) => (
                <option key={ch.id} value={ch.chapter_number}>
                  {ch.chapter_number} — {ch.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea
              disabled={removed || pending}
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => {
                const next = description.trim();
                if (next && next !== entry.description) {
                  onPatch(entry.id, { description: next });
                } else {
                  setDescription(entry.description);
                }
              }}
            />
          </div>
        </div>
      )}

      {codeLabels ? (
        <p className="mt-3 text-xs text-muted-foreground">ACS: {codeLabels}</p>
      ) : null}

      {!accepted ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {removed ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => onRestore(entry.id)}
            >
              Restore
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                disabled={pending}
                onClick={() => onAcceptOne(entry.id)}
              >
                Accept
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => onRemove(entry.id)}
              >
                Remove
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

function ReviewStep({
  entries,
  ataChapters,
  codesById,
  pending,
  onPatch,
  onRemove,
  onRestore,
  onAcceptOne,
  onAcceptAll,
}: {
  entries: PriorOjtProposedEntryRow[];
  ataChapters: AtaChapter[];
  codesById: Map<number, AcsCodeWithChapters>;
  pending: boolean;
  onPatch: (
    entryId: string,
    patch: {
      entryDate?: string;
      hoursWorked?: number;
      description?: string;
      ataChapterNumber?: string | null;
    }
  ) => void;
  onRemove: (entryId: string) => void;
  onRestore: (entryId: string) => void;
  onAcceptOne: (entryId: string) => void;
  onAcceptAll: () => void;
}) {
  const pendingEntries = entries.filter((e) => e.status === "pending");
  const acceptedCount = entries.filter((e) => e.status === "accepted").length;

  if (entries.length === 0) {
    return (
      <div className="space-y-3 text-center">
        <h2 className="text-2xl font-bold tracking-tight text-[#0f2744]">
          No log entries to create
        </h2>
        <p className="text-sm text-muted-foreground">
          You didn&apos;t claim any ACS codes. You can go back and add experience, or
          return to your skills profile.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-[#0f2744]">
          Review draft log entries
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          These will become draft logbook entries (not submitted to a mentor yet). Accept
          individually or all at once.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pendingEntries.length} pending · {acceptedCount} accepted ·{" "}
          {entries.filter((e) => e.status === "removed").length} removed
        </p>
      </div>

      {pendingEntries.length > 0 ? (
        <Button type="button" disabled={pending} onClick={onAcceptAll} className="w-full">
          {pending ? <Loader2 className="animate-spin" /> : null}
          Accept all pending ({pendingEntries.length})
        </Button>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          All proposed entries have been accepted or removed.{" "}
          <Link
            href="/dashboard/student/logbook"
            className="font-medium underline underline-offset-4"
          >
            Open logbook
          </Link>
        </div>
      )}

      <ul className="space-y-4">
        {entries.map((entry) => (
          <ProposedEntryCard
            key={entry.id}
            entry={entry}
            ataChapters={ataChapters}
            codesById={codesById}
            pending={pending}
            onPatch={onPatch}
            onRemove={onRemove}
            onRestore={onRestore}
            onAcceptOne={onAcceptOne}
          />
        ))}
      </ul>
    </div>
  );
}
