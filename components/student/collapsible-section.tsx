"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  icon?: React.ReactNode;
  /** Rendered after the title (e.g. buttons). Clicks do not toggle collapse. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
  defaultOpen?: boolean;
  /** When false, content is always visible and the header is not collapsible. */
  collapsible?: boolean;
  /** Applied to the title element. */
  titleClassName?: string;
  /** When false, the header does not get hover background (e.g. certification page). */
  headerHoverHighlight?: boolean;
  /** `card` wraps content in a bordered card; `section` uses spacing and typography only. */
  variant?: "card" | "section";
}

function SectionHeader({
  title,
  icon,
  actions,
  collapsible,
  isOpen,
  titleClassName,
  headerHoverHighlight,
  onToggle,
  variant,
}: {
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  collapsible: boolean;
  isOpen: boolean;
  titleClassName: string;
  headerHoverHighlight: boolean;
  onToggle?: () => void;
  variant: "card" | "section";
}) {
  const headerClassName = cn(
    "flex items-center justify-between gap-3",
    variant === "section" && "py-1",
    variant === "card" && undefined,
    collapsible && "cursor-pointer",
    collapsible &&
      headerHoverHighlight &&
      variant === "card" &&
      "hover:bg-accent/50 transition-colors",
    collapsible &&
      headerHoverHighlight &&
      variant === "section" &&
      "rounded-sm transition-colors hover:text-foreground/80",
    !collapsible && "cursor-default"
  );

  const inner = (
    <>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 sm:gap-3">
        {icon ? (
          <span
            className={cn(
              "shrink-0",
              variant === "section" && "text-muted-foreground [&>svg]:h-4 [&>svg]:w-4"
            )}
          >
            {icon}
          </span>
        ) : null}
        <h3 className={cn("min-w-0", titleClassName)}>{title}</h3>
        {actions ? (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        ) : null}
      </div>
      {collapsible ? (
        isOpen ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )
      ) : null}
    </>
  );

  if (variant === "card") {
    return (
      <CardHeader className={headerClassName} onClick={onToggle}>
        {inner}
      </CardHeader>
    );
  }

  return (
    <div className={headerClassName} onClick={onToggle} role={collapsible ? "button" : undefined}>
      {inner}
    </div>
  );
}

export function CollapsibleSection({
  title,
  icon,
  actions,
  children,
  defaultOpen = false,
  collapsible = true,
  titleClassName = "font-semibold",
  headerHoverHighlight = true,
  variant = "section",
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const showContent = collapsible ? isOpen : true;
  const hasBody = children != null;
  const onToggle = collapsible ? () => setIsOpen(!isOpen) : undefined;

  const body =
    showContent && hasBody ? (
      variant === "section" ? (
        <div className="pt-3">{children}</div>
      ) : (
        <CardContent className="pt-0">{children}</CardContent>
      )
    ) : null;

  if (variant === "section") {
    return (
      <section className="scroll-mt-6">
        <SectionHeader
          title={title}
          icon={icon}
          actions={actions}
          collapsible={collapsible}
          isOpen={isOpen}
          titleClassName={titleClassName}
          headerHoverHighlight={headerHoverHighlight}
          onToggle={onToggle}
          variant={variant}
        />
        {body}
      </section>
    );
  }

  return (
    <Card className="bg-card">
      <SectionHeader
        title={title}
        icon={icon}
        actions={actions}
        collapsible={collapsible}
        isOpen={isOpen}
        titleClassName={titleClassName}
        headerHoverHighlight={headerHoverHighlight}
        onToggle={onToggle}
        variant={variant}
      />
      {body}
    </Card>
  );
}
