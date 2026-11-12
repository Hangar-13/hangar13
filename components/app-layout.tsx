"use client";

import { usePathname } from "next/navigation";
import { AppNavigationProvider } from "@/components/app-navigation-provider";
import { LessonViewerChromeProvider } from "@/components/lesson-viewer-chrome";
import { MobileNavDrawer } from "@/components/mobile-nav-drawer";
import { Sidebar } from "@/components/sidebar";
import { TopNav } from "@/components/top-nav";
import { isMarketingPath } from "@/lib/marketing/is-marketing-path";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname?.startsWith("/auth");
  const isPublicMarketing = isMarketingPath(pathname);
  const isLessonViewer = pathname?.startsWith("/dashboard/lesson-player");

  if (isAuthPage || isPublicMarketing) {
    return <>{children}</>;
  }

  return (
    <AppNavigationProvider>
      <LessonViewerChromeProvider>
        <div className="relative flex h-screen overflow-hidden bg-background">
          <Sidebar />
          <MobileNavDrawer />
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <TopNav />
            {isLessonViewer ? (
              <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {children}
              </main>
            ) : (
              <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
                <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
                  {children}
                </div>
              </main>
            )}
          </div>
        </div>
      </LessonViewerChromeProvider>
    </AppNavigationProvider>
  );
}

