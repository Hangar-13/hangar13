"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getNotificationsForUser,
  deleteAllNotificationsForUser,
  deleteNotification,
  type Notification,
} from "@/app/actions/notifications";
import { supabaseClient } from "@/lib/supabaseClient";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { hasOrganizationRolePermission } from "@/lib/auth-shared";
import { cn } from "@/lib/utils";
import { formatUiDate } from "@/lib/format-ui-date";

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatUiDate(date);
}

export function NotificationDropdown() {
  const router = useRouter();
  const { organizationRole } = useAppNavigation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    const data = await getNotificationsForUser();
    setNotifications(data);
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Also fetch when dropdown opens for fresh list
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Refetch when auth changes (e.g. after login) so badge appears right away
  useEffect(() => {
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(() => {
      fetchNotifications();
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    await deleteAllNotificationsForUser();
    setNotifications([]);
    setIsOpen(false);
    router.refresh();
  };

  const handleNotificationClick = async (n: Notification) => {
    const isMentor =
      organizationRole != null &&
      hasOrganizationRolePermission(organizationRole, "mentor");
    const logIds = n.log_entry_ids ?? [];
    const singleId = logIds.length === 1 ? logIds[0] : null;

    const isLessonType =
      n.type === "lessons_awaiting" ||
      n.type === "lessons_approved" ||
      n.type === "lessons_rejected";

    let url: string;
    if (isLessonType) {
      if (singleId) {
        const { data: sub } = await supabaseClient
          .from("lesson_submissions")
          .select("user_training_id")
          .eq("id", singleId)
          .maybeSingle();
        const ut = sub?.user_training_id;
        if (ut) {
          url = isMentor
            ? `/dashboard/mentor/student/${ut}?openSubmission=${singleId}`
            : `/dashboard/student/training?openSubmission=${singleId}`;
        } else {
          url = isMentor ? "/dashboard/mentor/review-logs" : "/dashboard/student/training";
        }
      } else {
        url = isMentor ? "/dashboard/mentor/review-logs" : "/dashboard/student/training";
      }
    } else if (isMentor) {
      url = singleId
        ? `/dashboard/mentor/review-logs?openLog=${singleId}`
        : "/dashboard/mentor/review-logs";
    } else {
      url = singleId
        ? `/dashboard/student/logbook?openLog=${singleId}`
        : "/dashboard/student/logbook";
    }

    // Delete notification from database and update UI
    await deleteNotification(n.id);
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    setIsOpen(false);

    // Use full navigation to ensure we land on the correct page with search params.
    window.location.href = url;
  };

  const unreadCount = notifications.length;

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 relative"
        title="Notifications"
        onClick={() => setIsOpen((o) => !o)}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <span className="sr-only">Notifications</span>
      </Button>

      {isOpen && (
        <div
          className={cn(
            "absolute right-0 top-full z-50 mt-2 w-80 rounded-md border bg-popover p-0 shadow-lg",
            "animate-in fade-in-0 zoom-in-95"
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Notifications</h3>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={handleMarkAllRead}
              >
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No new notifications
              </div>
            ) : (
              <ul className="divide-y">
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    className="px-4 py-3 text-sm hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => handleNotificationClick(n)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNotificationClick(n);
                      }
                    }}
                  >
                    <p className="font-medium">{n.message}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatTimeAgo(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
