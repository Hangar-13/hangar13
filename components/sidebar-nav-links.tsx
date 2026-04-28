"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavGroup, type NavGroup, type NavSection } from "@/lib/navigation";

type SidebarNavLinksProps = {
  navigationSections: NavSection[];
  isLoading: boolean;
  onNavigate?: () => void;
};

function flattenNavEntries(sections: NavSection[]) {
  return sections.flatMap((s) =>
    s.items.flatMap((e) => (isNavGroup(e) ? e.children : [e]))
  );
}

function countFlatLeavesBeforeSection(
  sections: NavSection[],
  beforeSectionIndex: number
) {
  return sections
    .slice(0, beforeSectionIndex)
    .reduce(
      (sum, s) =>
        sum +
        s.items.reduce(
          (n, e) => n + (isNavGroup(e) ? e.children.length : 1),
          0
        ),
      0
    );
}

function groupHasActiveRoute(
  pathname: string | null,
  group: NavGroup
): boolean {
  const paths = [group.defaultHref, ...group.children.map((c) => c.href)];
  return paths.some((href) => {
    if (!pathname) return false;
    if (pathname === href) return true;
    return pathname.startsWith(href + "/");
  });
}

export function SidebarNavLinks({
  navigationSections,
  isLoading,
  onNavigate,
}: SidebarNavLinksProps) {
  const pathname = usePathname();

  const flatItems = flattenNavEntries(navigationSections);
  const matchingRoutes = flatItems
    .map((item, index) => ({
      item,
      index,
      matchLength:
        pathname === item.href
          ? item.href.length
          : pathname?.startsWith(item.href + "/")
            ? item.href.length
            : 0,
    }))
    .filter((route) => route.matchLength > 0)
    .sort((a, b) => b.matchLength - a.matchLength);

  const activeItemIndex =
    matchingRoutes.length > 0 ? matchingRoutes[0].index : -1;

  return (
    <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
      {isLoading ? (
        <div className="text-sm text-muted-foreground px-3 py-2">Loading...</div>
      ) : (
        navigationSections.map((section, sectionIndex) => {
          const sectionOffset = countFlatLeavesBeforeSection(
            navigationSections,
            sectionIndex
          );

          return (
            <div
              key={sectionIndex}
              className={cn(
                sectionIndex > 0 &&
                  (section.separatorBefore
                    ? "mt-4 border-t border-sidebar-border pt-6"
                    : "mt-6")
              )}
            >
              {section.title && (
                <div className="mb-2 px-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.title}
                  </h3>
                </div>
              )}
              <div className="space-y-1">
                {(() => {
                  let offsetInSection = 0;
                  return section.items.map((entry) => {
                    if (isNavGroup(entry)) {
                      const group = entry;
                      const sectionActive = groupHasActiveRoute(
                        pathname,
                        group
                      );
                      const expanded = sectionActive;

                      const groupStartOffset = offsetInSection;
                      offsetInSection += group.children.length;

                      const parent = (
                        <Link
                          href={group.defaultHref}
                          onClick={onNavigate}
                          className={cn(
                            "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                            sectionActive
                              ? "bg-sidebar-accent/45 text-sidebar-accent-foreground shadow-sm"
                              : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                          )}
                        >
                          <group.icon
                            className={cn(
                              "h-5 w-5 transition-transform flex-shrink-0",
                              sectionActive
                                ? "scale-110"
                                : "group-hover:scale-105"
                            )}
                          />
                          <span className="flex-1 text-left">{group.name}</span>
                          {expanded ? (
                            <ChevronDown
                              className="h-4 w-4 shrink-0 opacity-70"
                              aria-hidden
                            />
                          ) : (
                            <ChevronRight
                              className="h-4 w-4 shrink-0 opacity-70"
                              aria-hidden
                            />
                          )}
                        </Link>
                      );

                      return (
                        <div key={group.name} className="space-y-1">
                          {parent}
                          {expanded ? (
                            <div className="space-y-1">
                              {group.children.map((child, childIndex) => {
                                const globalIndex =
                                  sectionOffset + groupStartOffset + childIndex;
                                const isActive =
                                  globalIndex === activeItemIndex;
                                const isDisabled = Boolean(child.disabled);

                                const rowClass = cn(
                                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                                  "ml-4 pl-2 border-l-2 border-sidebar-border",
                                  isDisabled
                                    ? "cursor-not-allowed opacity-50 pointer-events-none text-muted-foreground"
                                    : isActive
                                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                                );

                                if (isDisabled) {
                                  return (
                                    <span
                                      key={child.href}
                                      className={rowClass}
                                      aria-disabled="true"
                                    >
                                      <child.icon
                                        className="h-5 w-5 flex-shrink-0"
                                        aria-hidden
                                      />
                                      <span>{child.name}</span>
                                    </span>
                                  );
                                }

                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    onClick={onNavigate}
                                    className={rowClass}
                                  >
                                    <child.icon
                                      className={cn(
                                        "h-5 w-5 transition-transform flex-shrink-0",
                                        isActive
                                          ? "scale-110"
                                          : "group-hover:scale-105"
                                      )}
                                    />
                                    <span>{child.name}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    }

                    const item = entry;
                    const itemIndex = offsetInSection;
                    offsetInSection += 1;
                    const globalIndex = sectionOffset + itemIndex;
                    const isActive = globalIndex === activeItemIndex;

                    const isSubItem = Boolean(item.subItem);
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isSubItem
                            ? "ml-4 pl-2 border-l-2 border-sidebar-border"
                            : "",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <item.icon
                          className={cn(
                            "h-5 w-5 transition-transform flex-shrink-0",
                            isActive ? "scale-110" : "group-hover:scale-105"
                          )}
                        />
                        <span>{item.name}</span>
                      </Link>
                    );
                  });
                })()}
              </div>
            </div>
          );
        })
      )}
    </nav>
  );
}
