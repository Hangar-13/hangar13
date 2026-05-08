"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  normalizeSystemRole,
  highestOrganizationRole,
  type OrganizationRole,
  type SystemRole,
} from "@/lib/auth-shared";
import { getNavigationSections, type NavSection } from "@/lib/navigation";
import type { OrgSwitcherMembership } from "@/components/organization-switcher";
import type {
  TrainingProgramSwitcherInitialData,
  UserTrainingEnrollmentRow,
} from "@/lib/my-trainings-display";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";

type ActiveOrganizationPayload = {
  activeOrganizationId: string | null;
  organizationRole: OrganizationRole | null;
  memberships: OrgSwitcherMembership[];
};

type AppNavigationContextValue = {
  navigationSections: NavSection[];
  isLoading: boolean;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  openMobileNav: () => void;
  /** Re-count user_trainings after enroll / purchase (student & mentor trainee nav). */
  refreshTraineeEnrollment: () => Promise<void>;
  systemRole: SystemRole | null;
  activeOrganizationId: string | null;
  organizationRole: OrganizationRole | null;
  memberships: OrgSwitcherMembership[];
  refreshOrganizations: () => Promise<void>;
  /** Active enrollment for student training switcher (top bar); null if signed out. */
  trainingSwitcherData: TrainingProgramSwitcherInitialData | null;
  refreshTrainingSwitcher: () => Promise<void>;
};

const AppNavigationContext = createContext<AppNavigationContextValue | null>(
  null
);

async function fetchActiveOrganization(): Promise<ActiveOrganizationPayload | null> {
  const res = await fetch("/api/me/active-organization", {
    credentials: "same-origin",
  });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as ActiveOrganizationPayload;
}

export function AppNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [systemRole, setSystemRole] = useState<SystemRole | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<
    string | null
  >(null);
  const [organizationRole, setOrganizationRole] =
    useState<OrganizationRole | null>(null);
  const [memberships, setMemberships] = useState<OrgSwitcherMembership[]>([]);
  const [studentHasTrainings, setStudentHasTrainings] = useState<
    boolean | null
  >(null);
  const [trainingSwitcherData, setTrainingSwitcherData] =
    useState<TrainingProgramSwitcherInitialData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadTrainingSwitcherForUser = useCallback(async (userId: string) => {
    try {
      const [profile, { data: rows, error }] = await Promise.all([
        fetchSessionUserProfile(supabaseClient),
        supabaseClient
          .from("user_trainings")
          .select(
            `
            id,
            status,
            start_date,
            end_date,
            training_path_id,
            training_paths:training_path_id ( id, name, description, is_active )
          `
          )
          .eq("user_id", userId)
          .order("start_date", { ascending: false }),
      ]);

      if (error) {
        console.error("loadTrainingSwitcherForUser:", error);
        return;
      }

      const list = (rows ?? []) as UserTrainingEnrollmentRow[];
      const inProgress = list.filter((r) => r.status !== "completed");
      setTrainingSwitcherData({
        currentUserTrainingId: profile?.current_curriculum_id ?? null,
        inProgress,
      });
    } catch (e) {
      console.error("loadTrainingSwitcherForUser:", e);
    }
  }, []);

  const refreshTrainingSwitcher = useCallback(async () => {
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) {
      setTrainingSwitcherData(null);
      return;
    }
    await loadTrainingSwitcherForUser(user.id);
  }, [loadTrainingSwitcherForUser]);

  const refreshOrganizations = useCallback(async () => {
    const payload = await fetchActiveOrganization();
    if (payload) {
      setActiveOrganizationId(payload.activeOrganizationId);
      setOrganizationRole(payload.organizationRole);
      setMemberships(payload.memberships);
    }
  }, []);

  useEffect(() => {
    async function loadNavigationContext() {
      try {
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) {
          setSystemRole(null);
          setActiveOrganizationId(null);
          setOrganizationRole(null);
          setMemberships([]);
          setStudentHasTrainings(null);
          setTrainingSwitcherData(null);
          setIsLoading(false);
          return;
        }

        const [profile, payload] = await Promise.all([
          fetchSessionUserProfile(supabaseClient),
          fetchActiveOrganization(),
        ]);

        const role = normalizeSystemRole(profile?.role as string | undefined);
        setSystemRole(role);

        if (payload) {
          setActiveOrganizationId(payload.activeOrganizationId);
          setOrganizationRole(payload.organizationRole);
          setMemberships(payload.memberships);
        }

        const { count, error } = await supabaseClient
          .from("user_trainings")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id);

        if (error) {
          console.error("Error counting user_trainings:", error);
          setStudentHasTrainings(true);
        } else {
          setStudentHasTrainings((count ?? 0) > 0);
        }

        await loadTrainingSwitcherForUser(user.id);
      } catch (error) {
        console.error("Error fetching navigation context:", error);
        setSystemRole("standard");
        setStudentHasTrainings(true);
      } finally {
        setIsLoading(false);
      }
    }

    void loadNavigationContext();
  }, [loadTrainingSwitcherForUser]);

  const refreshTraineeEnrollment = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (!user) return;

      const { count, error } = await supabaseClient
        .from("user_trainings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (error) {
        console.error("refreshTraineeEnrollment:", error);
        return;
      }
      setStudentHasTrainings((count ?? 0) > 0);
      await loadTrainingSwitcherForUser(user.id);
    } catch (e) {
      console.error("refreshTraineeEnrollment:", e);
    }
  }, [loadTrainingSwitcherForUser]);

  const navigationSections = useMemo(() => {
    const highestOrgRole =
      memberships.length > 0
        ? highestOrganizationRole(memberships.map((m) => m.role))
        : null;
    return getNavigationSections(systemRole, organizationRole, {
      studentHasTrainings: studentHasTrainings ?? true,
      highestOrganizationRole: highestOrgRole,
    });
  }, [systemRole, organizationRole, studentHasTrainings, memberships]);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);

  const value = useMemo(
    () => ({
      navigationSections,
      isLoading,
      mobileNavOpen,
      setMobileNavOpen,
      openMobileNav,
      refreshTraineeEnrollment,
      systemRole,
      activeOrganizationId,
      organizationRole,
      memberships,
      refreshOrganizations,
      trainingSwitcherData,
      refreshTrainingSwitcher,
    }),
    [
      navigationSections,
      isLoading,
      mobileNavOpen,
      openMobileNav,
      refreshTraineeEnrollment,
      systemRole,
      activeOrganizationId,
      organizationRole,
      memberships,
      refreshOrganizations,
      trainingSwitcherData,
      refreshTrainingSwitcher,
    ]
  );

  return (
    <AppNavigationContext.Provider value={value}>
      {children}
    </AppNavigationContext.Provider>
  );
}

export function useAppNavigation() {
  const ctx = useContext(AppNavigationContext);
  if (!ctx) {
    throw new Error(
      "useAppNavigation must be used within AppNavigationProvider"
    );
  }
  return ctx;
}
