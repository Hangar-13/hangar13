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
  CreditCard,
  Landmark,
} from "lucide-react";
import {
  hasOrganizationRolePermission,
  hasPlatformAdminAccess,
  highestOrganizationRole,
  type OrganizationRole,
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
  /**
   * Highest role across all org memberships. Used for Mentoring / Training Manager (and “My Training”)
   * so mentors who are students in the active org still see mentor tools. Organization supervisor nav
   * still keys off the active org role only.
   */
  highestOrganizationRole?: OrganizationRole | null;
};

function showStudentNavShell(systemRole: SystemRole | null): boolean {
  if (systemRole == null) {
    return true;
  }
  if (systemRole === "guest") {
    return true;
  }
  return (
    systemRole === "standard" ||
    systemRole === "admin" ||
    systemRole === "god"
  );
}

export function getNavigationSections(
  systemRole: SystemRole | null,
  activeOrganizationRole: OrganizationRole | null,
  options?: NavigationOptions
): NavSection[] {
  const hasTrainings = options?.studentHasTrainings ?? true;
  const trainingGroup = buildStudentTrainingGroup(hasTrainings);
  const capabilityRole =
    options?.highestOrganizationRole ?? activeOrganizationRole;

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

  const organizationSupervisorNavigation: NavItem[] = [
    { name: "Overview", href: "/dashboard/organization", icon: Landmark },
    { name: "Members", href: "/dashboard/organization/members", icon: Users },
    {
      name: "Subscriptions",
      href: "/dashboard/organization/subscriptions",
      icon: CreditCard,
    },
    {
      name: "Progress",
      href: "/dashboard/organization/progress",
      icon: TrendingUp,
    },
  ];

  if (!showStudentNavShell(systemRole)) {
    return [];
  }

  const sections: NavSection[] = [];

  const showMyTrainingLabel =
    capabilityRole != null &&
    hasOrganizationRolePermission(capabilityRole, "mentor");

  const myTrainingSection: NavSection = {
    title: showMyTrainingLabel ? "My Training" : null,
    items: mentorTrainingNavigation,
  };

  if (systemRole && hasPlatformAdminAccess(systemRole)) {
    sections.push({ title: "Admin", items: godAdminNavigation });
  }

  if (
    activeOrganizationRole != null &&
    hasOrganizationRolePermission(activeOrganizationRole, "supervisor")
  ) {
    sections.push({
      title: "Organization",
      items: organizationSupervisorNavigation,
      separatorBefore: sections.length > 0,
    });
  }

  if (
    capabilityRole &&
    hasOrganizationRolePermission(capabilityRole, "manager")
  ) {
    sections.push({
      title: "Training Manager",
      items: managerContentNavigation,
      separatorBefore: sections.length > 0,
    });
  }

  if (
    capabilityRole &&
    hasOrganizationRolePermission(capabilityRole, "mentor")
  ) {
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
