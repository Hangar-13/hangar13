"use client";

import { usePathname } from "next/navigation";
import { AppNavigationProvider } from "@/components/app-navigation-provider";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { Sidebar } from "@/components/sidebar";
import { TopNav } from "@/components/top-nav";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <AppNavigationProvider>
      <div className="relative flex h-screen overflow-hidden">
        <Sidebar />
        <MobileNavDrawer />
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <TopNav />
          <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AppNavigationProvider>
  );
}

