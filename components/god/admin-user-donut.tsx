"use client";

import type { AdminUserBreakdownSlice } from "@/lib/admin-dashboard";

type Props = {
  slices: AdminUserBreakdownSlice[];
  /** Logged-in platform total unique users (center); slice sizes use membership counts and may sum higher. */
  totalUsers: number;
};

/**
 * Donut: segment sizes reflect membership row counts (multi-org users count in each org).
 * Center shows unique user total from `users` — can be less than the sum of segment counts.
 */
export function AdminUserDonut({ slices, totalUsers }: Props) {
  const segmentTotal = slices.reduce((s, x) => s + x.count, 0);
  if (segmentTotal === 0 || slices.length === 0) {
    return (
      <div className="flex h-52 w-52 items-center justify-center rounded-full border border-dashed text-sm text-muted-foreground">
        No data
      </div>
    );
  }

  let acc = 0;
  const parts = slices.map((slice) => {
    const startDeg = (acc / segmentTotal) * 360;
    acc += slice.count;
    const endDeg = (acc / segmentTotal) * 360;
    return `${slice.color} ${startDeg}deg ${endDeg}deg`;
  });

  return (
    <div className="relative mx-auto h-56 w-56 shrink-0">
      <div
        className="h-full w-full rounded-full shadow-inner"
        style={{
          background: `conic-gradient(from 0deg, ${parts.join(", ")})`,
        }}
        role="img"
        aria-label="Organization membership distribution"
      />
      <div className="absolute inset-[20%] flex flex-col items-center justify-center rounded-full border bg-card text-center shadow-sm">
        <span className="text-3xl font-bold tabular-nums leading-none">
          {totalUsers.toLocaleString()}
        </span>
        <span className="text-muted-foreground mt-1 text-xs font-medium">
          Users
        </span>
      </div>
    </div>
  );
}

export function AdminUserDonutLegend({ slices }: { slices: AdminUserBreakdownSlice[] }) {
  const segmentTotal = slices.reduce((s, x) => s + x.count, 0);
  if (segmentTotal === 0) return null;

  return (
    <ul className="w-full max-w-2xl space-y-2.5 text-sm">
      {slices.map((slice) => (
        <li
          key={`${slice.label}-${slice.count}`}
          className="flex w-full items-start justify-between gap-4"
        >
          <span className="flex min-w-0 items-start gap-2.5">
            <span
              className="mt-0.5 h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: slice.color }}
              aria-hidden
            />
            <span className="min-w-0 break-words text-foreground">
              {slice.label}
            </span>
          </span>
          <span className="shrink-0 tabular-nums text-muted-foreground text-right">
            {slice.count.toLocaleString()}{" "}
            <span className="text-xs">
              ({Math.round((slice.count / segmentTotal) * 100)}%)
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}
