"use client";

import Link from "next/link";
import { SidebarNavLinks } from "@/components/sidebar-nav-links";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { Hangar13Mark } from "@/components/brand/hangar13-mark";
import { PaletteToggle } from "@/components/palette-toggle";

export function Sidebar() {
  const { navigationSections, isLoading } = useAppNavigation();

  return (
    <aside className="hidden lg:flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-sm">
      <Link
        href="/"
        className="flex min-h-20 flex-col justify-center gap-1.5 border-b border-sidebar-border px-6 py-4"
      >
        <Hangar13Mark onDark />
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-white/45">
          Training platform
        </p>
      </Link>
      <SidebarNavLinks
        navigationSections={navigationSections}
        isLoading={isLoading}
      />
      <div className="mt-auto space-y-4 border-t border-sidebar-border p-4">
        <PaletteToggle />
        <div className="text-center text-xs text-sidebar-foreground/45">
          <p className="font-medium">v1.0.0</p>
          <p className="mt-1">Aviation Training System</p>
        </div>
      </div>
    </aside>
  );
}
