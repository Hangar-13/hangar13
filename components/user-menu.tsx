"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { getUserInitials } from "@/lib/user-initials";
import { supabaseClient } from "@/lib/supabaseClient";
import { cn } from "@/lib/utils";

export function UserMenu() {
  const router = useRouter();
  const { sessionUser, refreshSessionUser } = useAppNavigation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const initials = getUserInitials(sessionUser?.fullName, sessionUser?.email);
  const displayName = sessionUser?.fullName?.trim() || sessionUser?.email || "Account";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(() => {
      void refreshSessionUser();
    });
    return () => subscription.unsubscribe();
  }, [refreshSessionUser]);

  async function handleSignOut() {
    await supabaseClient.auth.signOut();
    window.location.href = "/auth/login";
  }

  function navigate(path: string) {
    setIsOpen(false);
    router.push(path);
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 rounded-full p-0"
        title={displayName}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          )}
        >
          {initials}
        </span>
        <span className="sr-only">User menu</span>
      </Button>

      {isOpen ? (
        <div
          role="menu"
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-56 rounded-md border bg-popover p-1 shadow-lg",
            "animate-in fade-in-0 zoom-in-95"
          )}
        >
          <div className="border-b px-3 py-2">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {sessionUser?.email ? (
              <p className="truncate text-xs text-muted-foreground">
                {sessionUser.email}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
            onClick={() => navigate("/dashboard/profile")}
          >
            <User className="h-4 w-4" />
            Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm hover:bg-accent"
            onClick={() => navigate("/dashboard/preferences")}
          >
            <Settings className="h-4 w-4" />
            Preferences
          </button>
          <div className="my-1 border-t" />
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm text-destructive hover:bg-accent"
            onClick={() => void handleSignOut()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
