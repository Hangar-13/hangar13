import { cn } from "@/lib/utils";

/** Muted page backdrop used on dashboard views. */
export function DashboardPageShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-4 space-y-6 rounded-lg bg-muted/40 px-4 py-6 sm:-mx-6 sm:px-6",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Single elevated white surface for grouped dashboard content. */
export function DashboardContentFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "space-y-6 rounded-md bg-background px-5 py-6 shadow-sm ring-1 ring-black/[0.04] sm:space-y-7 sm:px-8 sm:py-8",
        className
      )}
    >
      {children}
    </div>
  );
}

/** Uppercase section label used across dashboard pages. */
export function DashboardSectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground",
        className
      )}
    >
      {children}
    </h2>
  );
}

export function DashboardStatStrip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted/25 px-4 py-4 sm:px-5 sm:py-5",
        className
      )}
    >
      {children}
    </div>
  );
}

export function DashboardStatCell({
  value,
  label,
  detail,
  className,
}: {
  value: React.ReactNode;
  label: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 px-4 first:pl-0 last:pr-0 sm:px-5", className)}>
      <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</p>
      {detail ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">{detail}</p>
      ) : null}
    </div>
  );
}

/** Accent highlight block (e.g. current training, featured item). */
export function DashboardAccentBlock({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-primary/15 px-5 py-4 sm:px-6 sm:py-5",
        className
      )}
    >
      <div className="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden />
      <div className="pl-2">{children}</div>
    </div>
  );
}

/** Bordered table/list container — one surface, not nested cards. */
export function DashboardTableShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-x-auto rounded-md ring-1 ring-black/[0.04]",
        className
      )}
    >
      {children}
    </div>
  );
}
