"use client";

import Link from "next/link";
import Image from "next/image";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarNavLinks } from "@/components/sidebar-nav-links";
import { useAppNavigation } from "@/components/app-navigation-provider";

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
          className="flex min-h-20 items-center gap-3 border-b border-sidebar-border px-6 py-4"
        >
          <Image
            src="/images/hangar13Logo.png"
            alt="Hangar 13"
            width={80}
            height={80}
            className="h-16 w-auto object-contain sm:h-20"
            priority
          />
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-sidebar-foreground">
              Hangar 13
            </h2>
            <p className="text-xs text-muted-foreground">Training Platform</p>
          </div>
        </Link>
        <SidebarNavLinks
          navigationSections={navigationSections}
          isLoading={isLoading}
          onNavigate={() => setMobileNavOpen(false)}
        />
        <div className="border-t border-sidebar-border p-4 mt-auto">
          <div className="text-xs text-muted-foreground text-center">
            <p className="font-medium">v1.0.0</p>
            <p className="mt-1">Aviation Training System</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
