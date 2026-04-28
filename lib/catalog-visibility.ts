import { cn } from "@/lib/utils";

export const CATALOG_VISIBILITY_VALUES = [
  "draft",
  "unreleased",
  "proprietary",
  "public",
] as const;

export type CatalogVisibility = (typeof CATALOG_VISIBILITY_VALUES)[number];

export type CatalogVisibilityEntityKind = "course" | "trainingPath";

export function isCatalogVisibility(v: unknown): v is CatalogVisibility {
  return (
    typeof v === "string" &&
    (CATALOG_VISIBILITY_VALUES as readonly string[]).includes(v)
  );
}

export function normalizeCatalogVisibility(
  v: unknown,
  fallback: CatalogVisibility
): CatalogVisibility {
  return isCatalogVisibility(v) ? v : fallback;
}

/** Short label shown on badges and in selects. */
export function catalogVisibilityTitle(v: CatalogVisibility): string {
  switch (v) {
    case "draft":
      return "Draft";
    case "unreleased":
      return "Unreleased";
    case "proprietary":
      return "Proprietary";
    case "public":
      return "Public";
  }
}

/** Training path visibility copy (matches product wording for paths, not courses). */
const trainingPathVisibilityDescriptions: Record<CatalogVisibility, string> = {
  draft: "Only visible to you",
  unreleased: "Only visible to managers and admins in your org",
  proprietary: "Only visible to users in your org",
  public: "Visible to all users",
};

/** Short hint next to the badge (courses) or same copy as editor (training paths). */
export function catalogVisibilityBriefHint(
  v: CatalogVisibility,
  kind: CatalogVisibilityEntityKind
): string {
  if (kind === "trainingPath") {
    return trainingPathVisibilityDescriptions[v];
  }
  switch (v) {
    case "draft":
      return "Authors editing only";
    case "unreleased":
      return "Managers preview stage";
    case "proprietary":
      return "Usable in org paths";
    case "public":
      return "Shared across organizations";
  }
}

/** One-sentence explanation while choosing visibility in the editor. */
export function catalogVisibilityEditorExplanation(
  v: CatalogVisibility,
  kind: CatalogVisibilityEntityKind
): string {
  if (kind === "trainingPath") {
    return trainingPathVisibilityDescriptions[v];
  }
  switch (v) {
    case "draft":
      return "Content is still being edited and is not ready for path builders or peer review.";
    case "unreleased":
      return "Managers can review the course before it is offered more widely in your org.";
    case "proprietary":
      return "The course can be added to training paths for your organization and linked content.";
    case "public":
      return "Other organizations can reference or use this course where sharing rules allow.";
  }
}

const badgeClass: Record<CatalogVisibility, string> = {
  draft:
    "border-border bg-muted/80 text-foreground dark:bg-muted/40",
  unreleased:
    "border-amber-500/30 bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-50",
  proprietary:
    "border-blue-500/25 bg-blue-100 text-blue-950 dark:bg-blue-950/40 dark:text-blue-50",
  public:
    "border-emerald-600/20 bg-emerald-100 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-900/50 dark:text-emerald-100",
};

export function catalogVisibilityBadgeClassName(
  v: CatalogVisibility
): string {
  return cn(
    "shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium",
    badgeClass[v]
  );
}
