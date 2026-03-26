"use client";

import Link from "next/link";
import Image from "next/image";
import { SidebarNavLinks } from "@/components/sidebar-nav-links";
import { useAppNavigation } from "@/components/app-navigation-provider";

export function Sidebar() {
  const { navigationSections, isLoading } = useAppNavigation();

  return (
    <aside className="hidden lg:flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-sm">
      <Link
        href="/"
        className="flex min-h-20 items-center gap-3 border-b border-sidebar-border px-6 py-4"
      >
        <Image
          src="/images/hangar13Logo.png"
          alt="Hangar 13"
          width={80}
          height={80}
          className="h-20 w-auto object-contain"
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
      />
      <div className="border-t border-sidebar-border p-4">
        <div className="text-xs text-muted-foreground text-center">
          <p className="font-medium">v1.0.0</p>
          <p className="mt-1">Aviation Training System</p>
        </div>
      </div>
    </aside>
  );
}
