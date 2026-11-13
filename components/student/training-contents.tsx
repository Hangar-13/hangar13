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
};

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
                    "flex items-start gap-2 px-3 py-2.5 text-sm text-foreground",
                    covered && "text-muted-foreground opacity-60",
                    item.current && "bg-muted font-semibold text-foreground opacity-100"
                  )}
                >
                  <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                    {item.number}
                  </span>
                  <span className="min-w-0 flex-1 leading-snug">
                    {item.completed ? <span className="sr-only">Completed. </span> : null}
                    {item.optional ? <span className="sr-only">Optional. </span> : null}
                    {item.title}
                  </span>
                  {item.completed ? (
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                      <Check className="size-3" aria-hidden />
                    </span>
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
