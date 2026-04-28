import { cn } from "@/lib/utils";

const leadBadgeClassName =
  "shrink-0 inline-flex items-center rounded-md border border-emerald-600/20 bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-900/50 dark:text-emerald-100";

type LeadBadgeProps = {
  className?: string;
};

/** Consistent "Lead" label for org members who are the organization lead. */
export function LeadBadge({ className }: LeadBadgeProps) {
  return <span className={cn(leadBadgeClassName, className)}>Lead</span>;
}
