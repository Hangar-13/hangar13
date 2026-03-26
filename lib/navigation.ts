import type { LucideIcon } from "lucide-react";
import {
  Home,
  BookOpen,
  ClipboardList,
  TrendingUp,
  Users,
  Settings,
  BarChart3,
  Search,
  Award,
  ClipboardCheck,
} from "lucide-react";
import type { UserRole } from "@/lib/auth";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  subItem?: boolean;
  /** When true, sidebar shows a non-link row (no navigation). */
  disabled?: boolean;
};

/** Parent row links to `defaultHref` (e.g. Current Training or Find Training); children listed below. */
export type NavGroup = {
  type: "group";
  name: string;
  icon: LucideIcon;
  defaultHref: string;
  children: NavItem[];
};

export type NavEntry = NavItem | NavGroup;

export type NavSection = {
  title: string | null;
  items: NavEntry[];
};

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "type" in entry && entry.type === "group";
}

function buildApprenticeTrainingGroup(hasTrainings: boolean): NavGroup {
  return {
    type: "group",
    name: "Training",
    icon: BookOpen,
    defaultHref: hasTrainings
      ? "/dashboard/apprentice/training"
      : "/dashboard/apprentice/find-training",
    children: [
      {
        name: "Current Training",
        href: "/dashboard/apprentice/training",
        icon: BookOpen,
        disabled: !hasTrainings,
      },
      {
        name: "Progress",
        href: "/dashboard/apprentice/progress",
        icon: TrendingUp,
        disabled: !hasTrainings,
      },
      {
        name: "Find Training",
        href: "/dashboard/apprentice/find-training",
        icon: Search,
      },
      {
        name: "My Trainings",
        href: "/dashboard/apprentice/credentials",
        icon: Award,
        disabled: !hasTrainings,
      },
    ],
  };
}

export type NavigationOptions = {
  /** When false, Training group defaults to Find Training and disables trainee-only links. */
  apprenticeHasTrainings?: boolean;
};

export function getNavigationSections(
  userRole: UserRole | null,
  options?: NavigationOptions
): NavSection[] {
  const hasTrainings = options?.apprenticeHasTrainings ?? true;
  const trainingGroup = buildApprenticeTrainingGroup(hasTrainings);

  const apprenticeNavigation: NavEntry[] = [
    { name: "Dashboard", href: "/dashboard/apprentice", icon: Home },
    trainingGroup,
    { name: "Logbook", href: "/dashboard/apprentice/logbook", icon: ClipboardList },
    { name: "Certification", href: "/dashboard/apprentice/certification", icon: ClipboardCheck },
  ];

  const mentorMentoringNavigation: NavEntry[] = [
    { name: "Summary", href: "/dashboard/mentor", icon: BarChart3 },
    { name: "Review Logs", href: "/dashboard/mentor/review-logs", icon: ClipboardList },
    { name: "My Apprentices", href: "/dashboard/mentor/mentees", icon: Users },
    {
      name: "Apprentice Progress",
      href: "/dashboard/mentor/mentees/progress",
      icon: TrendingUp,
      subItem: true,
    },
  ];

  const mentorTrainingNavigation: NavEntry[] = [
    { name: "Dashboard", href: "/dashboard/apprentice", icon: Home },
    trainingGroup,
    { name: "Logbook", href: "/dashboard/apprentice/logbook", icon: ClipboardList },
    { name: "Certification", href: "/dashboard/apprentice/certification", icon: ClipboardCheck },
  ];

  const managerNavigation: NavItem[] = [
    { name: "Dashboard", href: "/dashboard/mentor", icon: Home },
    { name: "Apprentices", href: "/dashboard/mentor/apprentices", icon: Users },
    { name: "Mentors", href: "/dashboard/mentor/mentors", icon: Users },
    { name: "Pending Entries", href: "/dashboard/mentor/pending", icon: ClipboardList },
    { name: "Reports", href: "/dashboard/mentor/reports", icon: BarChart3 },
    { name: "Settings", href: "/dashboard/mentor/settings", icon: Settings },
  ];

  if (!userRole) {
    return [{ title: null, items: apprenticeNavigation }];
  }

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
}
