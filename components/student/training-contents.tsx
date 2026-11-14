import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type TrainingContentsItem = {
  week: number;
  number: number;
  title: string;
  completed: boolean;
  optional: boolean;
  current: boolean;
  /** Courseware percent, 0–100. Null when the lesson has no courseware. */
  coursewarePercent: number | null;
  /** Shown in place of the percent once the courseware is finished. */
  contentsPrompt: "test" | "submit" | null;
};

function CoursewareProgress({
  percent,
  prompt,
}: {
  percent: number;
  prompt: "test" | "submit" | null;
}) {
  const size = 28;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = Math.min(100, Math.max(0, percent));
  const filled = circumference * (shown / 100);
  const title =
    prompt === "test"
      ? "Finish the test for this lesson"
      : prompt === "submit"
        ? "Submit your reflection for this lesson"
        : `${percent}% of this lesson`;

  if (prompt) {
    return (
      <span
        className="inline-flex h-7 max-h-[2.40625rem] shrink-0 items-center rounded-full border-2 border-[#92400e] bg-[#fef3c7] px-1.5 text-[9px] font-bold leading-none tracking-tight text-[#78350f] shadow-[inset_0_0_0_1.5px_#f59e0b]"
        title={title}
      >
        {prompt === "test" ? "TEST" : "SUBMIT"}
      </span>
    );
  }

  return (
    <span
      className="relative inline-flex size-7 shrink-0 items-center justify-center"
      title={title}
    >
      <svg className="absolute inset-0 -rotate-90" viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius - 0.5} fill="#fef3c7" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#92400e"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f59e0b"
          strokeWidth={stroke}
          strokeDasharray={`${filled} ${circumference}`}
          strokeLinecap="round"
        />
      </svg>
      <span className="relative text-[9px] font-bold leading-none tabular-nums text-[#78350f]">
        {percent}
      </span>
    </span>
  );
}

export function TrainingContents({ items }: { items: TrainingContentsItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="relative order-1 w-full shrink-0 lg:order-2 lg:w-72">
      <nav
        aria-label="Contents"
        className="max-h-[40vh] overflow-y-auto border border-[#ccd] bg-[#f7f8fb] lg:absolute lg:inset-0 lg:max-h-none dark:border-border dark:bg-muted/30"
      >
        <p className="border-b border-[#e3e6ee] px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground dark:border-border">
          Contents
        </p>
        <ol>
          {items.map((item) => {
            const covered = item.optional && !item.completed;
            return (
              <li key={item.week} className="border-b border-[#e3e6ee] last:border-b-0 dark:border-border">
                <Link
                  href={`/dashboard/student/training?week=${item.week}`}
                  aria-current={item.current ? "page" : undefined}
                  title={item.optional ? "This lesson is optional for you" : undefined}
                  className={cn(
                    "flex max-h-[calc(2.40625rem+1.25rem)] items-center gap-2 overflow-hidden px-3 py-2.5 text-sm text-foreground",
                    covered && "text-muted-foreground opacity-60",
                    item.current && "bg-muted font-semibold text-foreground opacity-100"
                  )}
                >
                  <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                    {item.number}
                  </span>
                  <span className="line-clamp-2 min-w-0 flex-1 leading-snug">
                    {item.completed ? <span className="sr-only">Completed. </span> : null}
                    {item.optional ? <span className="sr-only">Optional. </span> : null}
                    {!item.completed && item.contentsPrompt === "test" ? (
                      <span className="sr-only">Finish the test for this lesson. </span>
                    ) : null}
                    {!item.completed && item.contentsPrompt === "submit" ? (
                      <span className="sr-only">Submit your reflection for this lesson. </span>
                    ) : null}
                    {!item.completed &&
                    item.contentsPrompt == null &&
                    item.coursewarePercent != null &&
                    item.coursewarePercent > 0 ? (
                      <span className="sr-only">{item.coursewarePercent}% of this lesson. </span>
                    ) : null}
                    {item.title}
                  </span>
                  {item.completed ? (
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                      <Check className="size-3" aria-hidden />
                    </span>
                  ) : item.contentsPrompt != null ||
                    (item.coursewarePercent != null && item.coursewarePercent > 0) ? (
                    <CoursewareProgress
                      percent={item.coursewarePercent ?? 0}
                      prompt={item.contentsPrompt}
                    />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
