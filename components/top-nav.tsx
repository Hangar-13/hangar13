"use client";

import { useState, FormEvent } from "react";
import { Menu, Search, User, LogOut } from "lucide-react";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/supabaseClient";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopNav() {
  const router = useRouter();
  const { openMobileNav } = useAppNavigation();
  const [searchQuery, setSearchQuery] = useState("");

  async function handleSignOut() {
    await supabaseClient.auth.signOut();
    window.location.href = "/auth/login";
  }

  const handleSearch = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Try to find matches in chapters and logs
    // For now, we'll navigate to relevant pages based on the search
    // In the future, this could open a search results modal or page
    
    // Check if it's a chapter number (e.g., "07", "06", etc.)
    const chapterMatch = searchQuery.match(/\b(\d{2})\b/);
    if (chapterMatch) {
      // Navigate to logbook filtered by chapter
      router.push(`/dashboard/apprentice/logbook?chapter=${chapterMatch[1]}`);
      return;
    }

    // Check if it looks like a search for logbook entries
    if (searchQuery.toLowerCase().includes("log") || searchQuery.toLowerCase().includes("entry")) {
      router.push(`/dashboard/apprentice/logbook?search=${encodeURIComponent(searchQuery)}`);
      return;
    }

    // Check if it's a search for training material
    if (searchQuery.toLowerCase().includes("training") || searchQuery.toLowerCase().includes("chapter")) {
      router.push(`/dashboard/apprentice/training?search=${encodeURIComponent(searchQuery)}`);
      return;
    }

    // Default: search logbook
    router.push(`/dashboard/apprentice/logbook?search=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 sm:px-6 shadow-sm">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 lg:hidden"
        onClick={openMobileNav}
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex flex-1 items-center gap-4 min-w-0">
        <form onSubmit={handleSearch} className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search training material, logs, users..."
            className="w-full pl-9 pr-4 h-9 bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </form>
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <NotificationDropdown />
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9"
          title="User menu"
        >
          <User className="h-5 w-5" />
          <span className="sr-only">User menu</span>
        </Button>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-9 w-9"
          title="Sign out"
          onClick={handleSignOut}
        >
          <LogOut className="h-5 w-5" />
          <span className="sr-only">Sign out</span>
        </Button>
      </div>
    </header>
  );
}

