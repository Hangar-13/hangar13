"use client";

import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarNavLinks } from "@/components/sidebar-nav-links";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { Hangar13Mark } from "@/components/brand/hangar13-mark";
import { PaletteToggle } from "@/components/palette-toggle";

export function MobileNavDrawer() {
  const {
    navigationSections,
    isLoading,
    mobileNavOpen,
    setMobileNavOpen,
  } = useAppNavigation();

  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
      <SheetContent
        side="left"
        className="flex w-[min(100vw-2.5rem,20rem)] flex-col gap-0 border-sidebar-border bg-sidebar p-0 lg:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Main navigation</SheetTitle>
        </SheetHeader>
        <Link
          href="/"
          onClick={() => setMobileNavOpen(false)}
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
          onNavigate={() => setMobileNavOpen(false)}
        />
        <div className="mt-auto space-y-4 border-t border-sidebar-border p-4">
          <PaletteToggle />
          <div className="text-center text-xs text-sidebar-foreground/45">
            <p className="font-medium">v1.0.0</p>
            <p className="mt-1">Aviation Training System</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
