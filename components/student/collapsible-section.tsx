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
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const showContent = collapsible ? isOpen : true;
  const hasBody = children != null;

  return (
    <Card className="bg-card">
      <CardHeader
        className={cn(
          collapsible && "cursor-pointer",
          collapsible &&
            headerHoverHighlight &&
            "hover:bg-accent/50 transition-colors",
          !collapsible && "cursor-default"
        )}
        onClick={collapsible ? () => setIsOpen(!isOpen) : undefined}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            {icon ? <span className="shrink-0">{icon}</span> : null}
            <h3 className={cn("min-w-0", titleClassName)}>{title}</h3>
            {actions ? (
              <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
                {actions}
              </div>
            ) : null}
          </div>
          {collapsible ? (
            isOpen ? (
              <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
            )
          ) : null}
        </div>
      </CardHeader>
      {showContent && hasBody ? <CardContent className="pt-0">{children}</CardContent> : null}
    </Card>
  );
}
