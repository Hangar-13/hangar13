import type { MouseEventHandler } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const SIZE_CLASS = {
  sm: "text-base",
  md: "text-lg",
  lg: "text-2xl",
} as const;

export function Hangar13Mark({
  prefix = "HANGAR",
  accent = "13",
  href,
  onClick,
  size = "md",
  onDark = false,
  className,
}: {
  prefix?: string;
  accent?: string;
  href?: string | null;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  size?: keyof typeof SIZE_CLASS;
  onDark?: boolean;
  className?: string;
}) {
  const mark = (
    <span
      className={cn(
        "font-mono font-black tracking-[-.06em]",
        SIZE_CLASS[size],
        onDark ? "text-white" : "text-[#121417]",
        className
      )}
    >
      {prefix}
      <span className="text-[#FF4D00]">{accent}</span>
    </span>
  );

  if (!href) {
    return mark;
  }

  const label = `${prefix}${accent} home`;

  if (href.startsWith("#") || href.startsWith("http") || onClick) {
    return (
      <a href={href} onClick={onClick} className="inline-flex" aria-label={label}>
        {mark}
      </a>
    );
  }

  return (
    <Link href={href} className="inline-flex" aria-label={label}>
      {mark}
    </Link>
  );
}
