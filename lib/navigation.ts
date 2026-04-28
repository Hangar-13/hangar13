import type { LucideIcon } from "lucide-react";
import {
  Home,
  BookOpen,
  ClipboardList,
  TrendingUp,
  Users,
  Search,
  Award,
  ClipboardCheck,
  Library,
  Building2,
  LayoutDashboard,
} from "lucide-react";
import {
  hasSystemRolePermission,
  type SystemRole,
} from "@/lib/auth-shared";

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
  /** Draw a divider above this section (e.g. manager tools above main nav). */
  separatorBefore?: boolean;
};

export function isNavGroup(entry: NavEntry): entry is NavGroup {
  return "type" in entry && entry.type === "group";
}

function buildStudentTrainingGroup(hasTrainings: boolean): NavGroup {
  return {
    type: "group",
    name: "Training",
    icon: BookOpen,
    defaultHref: hasTrainings
      ? "/dashboard/student/training"
      : "/dashboard/student/find-training",
    children: [
      {
        name: "Current Training",
        href: "/dashboard/student/training",
        icon: BookOpen,
        disabled: !hasTrainings,
      },
      {
        name: "Progress",
        href: "/dashboard/student/progress",
        icon: TrendingUp,
        disabled: !hasTrainings,
      },
      {
        name: "Find Training",
        href: "/dashboard/student/find-training",
        icon: Search,
      },
      {
        name: "My Trainings",
        href: "/dashboard/student/credentials",
        icon: Award,
        disabled: !hasTrainings,
      },
    ],
  };
}

export type NavigationOptions = {
  /** When false, Training group defaults to Find Training and disables trainee-only links. */
  studentHasTrainings?: boolean;
};

export function getNavigationSections(
  userRole: SystemRole | null,
  options?: NavigationOptions
): NavSection[] {
  const hasTrainings = options?.studentHasTrainings ?? true;
  const trainingGroup = buildStudentTrainingGroup(hasTrainings);

  const mentorMentoringNavigation: NavEntry[] = [
    { name: "Dashboard", href: "/dashboard/mentor", icon: LayoutDashboard },
    { name: "Review Logs", href: "/dashboard/mentor/review-logs", icon: ClipboardList },
    { name: "My Students", href: "/dashboard/mentor/mentees", icon: Users },
    {
      name: "Student Progress",
      href: "/dashboard/mentor/mentees/progress",
      icon: TrendingUp,
      subItem: true,
    },
  ];

  const mentorTrainingNavigation: NavEntry[] = [
    { name: "Dashboard", href: "/dashboard/student", icon: Home },
    trainingGroup,
    { name: "Logbook", href: "/dashboard/student/logbook", icon: ClipboardList },
    { name: "Certification", href: "/dashboard/student/certification", icon: ClipboardCheck },
  ];

  const managerContentNavigation: NavItem[] = [
    {
      name: "Dashboard",
      href: "/dashboard/manager",
      icon: LayoutDashboard,
    },
    { name: "Content", href: "/dashboard/manager/content", icon: Library },
  ];

  const godAdminNavigation: NavItem[] = [
    { name: "Dashboard", href: "/dashboard/god", icon: LayoutDashboard },
    { name: "Users", href: "/dashboard/god/users", icon: Users },
    { name: "Organizations", href: "/dashboard/god/organizations", icon: Building2 },
  ];

  const canViewStudentStyleNav = (r: SystemRole | null) =>
    r == null || r === "guest" || hasSystemRolePermission(r, "student");

  if (!canViewStudentStyleNav(userRole)) {
    return [];
  }

  const sections: NavSection[] = [];

  const myTrainingLabel =
    userRole != null &&
    userRole !== "guest" &&
    hasSystemRolePermission(userRole, "mentor")
      ? "My Training"
      : null;

  const myTrainingSection: NavSection = {
    title: myTrainingLabel,
    items: mentorTrainingNavigation,
  };

  if (userRole && hasSystemRolePermission(userRole, "admin")) {
    sections.push({ title: "Admin", items: godAdminNavigation });
  }

  if (userRole && hasSystemRolePermission(userRole, "manager")) {
    sections.push({
      title: "Training Manager",
      items: managerContentNavigation,
      separatorBefore: sections.length > 0,
    });
  }

  if (userRole && hasSystemRolePermission(userRole, "mentor")) {
    sections.push({
      title: "Mentoring",
      items: mentorMentoringNavigation,
      separatorBefore: sections.length > 0,
    });
  }

  sections.push({
    ...myTrainingSection,
    separatorBefore: sections.length > 0,
  });

  return sections;
}
