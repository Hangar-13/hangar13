"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { supabaseClient } from "@/lib/supabaseClient";
import { 
  Home, 
  BookOpen,
  ClipboardList,
  TrendingUp,
  Users,
  Settings,
  FileText,
  BarChart3
} from "lucide-react";
import type { UserRole } from "@/lib/auth";

const apprenticeNavigation = [
  { name: "Dashboard", href: "/dashboard/apprentice", icon: Home },
  { name: "Training", href: "/dashboard/apprentice/training", icon: BookOpen },
  { name: "Logbook", href: "/dashboard/apprentice/logbook", icon: ClipboardList },
  { name: "Progress", href: "/dashboard/apprentice/progress", icon: TrendingUp },
];

// Mentor navigation is now split into sections
const mentorMentoringNavigation = [
  { name: "Summary", href: "/dashboard/mentor", icon: BarChart3 },
  { name: "Review Logs", href: "/dashboard/mentor/review-logs", icon: ClipboardList },
  { name: "My Apprentices", href: "/dashboard/mentor/mentees", icon: Users },
  { name: "Apprentice Progress", href: "/dashboard/mentor/mentees/progress", icon: TrendingUp, subItem: true },
];

const mentorTrainingNavigation = [
  { name: "Dashboard", href: "/dashboard/apprentice", icon: Home },
  { name: "Training", href: "/dashboard/apprentice/training", icon: BookOpen },
  { name: "Logbook", href: "/dashboard/apprentice/logbook", icon: ClipboardList },
  { name: "Progress", href: "/dashboard/apprentice/progress", icon: TrendingUp },
];

const managerNavigation = [
  { name: "Dashboard", href: "/dashboard/mentor", icon: Home },
  { name: "Apprentices", href: "/dashboard/mentor/apprentices", icon: Users },
  { name: "Mentors", href: "/dashboard/mentor/mentors", icon: Users },
  { name: "Pending Entries", href: "/dashboard/mentor/pending", icon: ClipboardList },
  { name: "Reports", href: "/dashboard/mentor/reports", icon: BarChart3 },
  { name: "Settings", href: "/dashboard/mentor/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function getUserRole() {
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          const { data: profile } = await supabaseClient
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();
          
          setUserRole((profile?.role as UserRole) || "apprentice");
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setUserRole("apprentice"); // Default fallback
      } finally {
        setIsLoading(false);
      }
    }

    getUserRole();
  }, []);

  const getNavigationSections = () => {
    if (!userRole) return [{ title: null, items: apprenticeNavigation }];
    
    switch (userRole) {
      case "apprentice":
        return [{ title: null, items: apprenticeNavigation }];
      case "mentor":
        return [
          { title: "Mentoring", items: mentorMentoringNavigation },
          { title: "My Training", items: mentorTrainingNavigation },
        ];
      case "manager":
      case "god":
        return [{ title: null, items: managerNavigation }];
      default:
        return [{ title: null, items: apprenticeNavigation }];
    }
  };

  const navigationSections = getNavigationSections();

  return (
    <aside className="hidden lg:flex h-full w-64 flex-col border-r border-sidebar-border bg-sidebar shadow-sm">
      <Link href="/" className="flex min-h-20 items-center gap-3 border-b border-sidebar-border px-6 py-4">
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
      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {isLoading ? (
          <div className="text-sm text-muted-foreground px-3 py-2">Loading...</div>
        ) : (
          navigationSections.map((section, sectionIndex) => {
            // Flatten all items to find active route
            const allItems = navigationSections.flatMap(s => s.items);
            const matchingRoutes = allItems
              .map((item, index) => ({
                item,
                index,
                matchLength: pathname === item.href 
                  ? item.href.length 
                  : pathname?.startsWith(item.href + "/") 
                    ? item.href.length 
                    : 0,
              }))
              .filter(route => route.matchLength > 0)
              .sort((a, b) => b.matchLength - a.matchLength);

            const activeItemIndex = matchingRoutes.length > 0 ? matchingRoutes[0].index : -1;
            const activeItem = allItems[activeItemIndex];

            return (
              <div key={sectionIndex} className={cn(sectionIndex > 0 && "mt-6")}>
                {section.title && (
                  <div className="mb-2 px-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {section.title}
                    </h3>
                  </div>
                )}
                <div className="space-y-1">
                  {section.items.map((item, itemIndex) => {
                    // Calculate the item's index in the flattened array
                    const globalIndex = navigationSections
                      .slice(0, sectionIndex)
                      .reduce((sum, s) => sum + s.items.length, 0) + itemIndex;
                    const isActive = globalIndex === activeItemIndex;
                    
                    const isSubItem = "subItem" in item && (item as { subItem?: boolean }).subItem;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                          isSubItem ? "ml-4 pl-2 border-l-2 border-sidebar-border" : "",
                          isActive
                            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                            : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <item.icon className={cn(
                          "h-5 w-5 transition-transform flex-shrink-0",
                          isActive ? "scale-110" : "group-hover:scale-105"
                        )} />
                        <span>{item.name}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="text-xs text-muted-foreground text-center">
          <p className="font-medium">v1.0.0</p>
          <p className="mt-1">Aviation Training System</p>
        </div>
      </div>
    </aside>
  );
}

