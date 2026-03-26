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
import type { UserRole } from "@/lib/auth";
import { getNavigationSections, type NavSection } from "@/lib/navigation";

type AppNavigationContextValue = {
  navigationSections: NavSection[];
  isLoading: boolean;
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  openMobileNav: () => void;
  /** Re-count user_trainings after enroll / purchase (apprentice & mentor trainee nav). */
  refreshTraineeEnrollment: () => Promise<void>;
};

const AppNavigationContext = createContext<AppNavigationContextValue | null>(
  null
);

export function AppNavigationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [apprenticeHasTrainings, setApprenticeHasTrainings] = useState<
    boolean | null
  >(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    async function loadNavigationContext() {
      try {
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) {
          setUserRole(null);
          setApprenticeHasTrainings(null);
          setIsLoading(false);
          return;
        }

        const { data: profile } = await supabaseClient
          .from("users")
          .select("role")
          .eq("id", user.id)
          .single();

        const role = (profile?.role as UserRole) || "apprentice";
        setUserRole(role);

        if (role === "apprentice" || role === "mentor") {
          const { count, error } = await supabaseClient
            .from("user_trainings")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);

          if (error) {
            console.error("Error counting user_trainings:", error);
            setApprenticeHasTrainings(true);
          } else {
            setApprenticeHasTrainings((count ?? 0) > 0);
          }
        } else {
          setApprenticeHasTrainings(true);
        }
      } catch (error) {
        console.error("Error fetching navigation context:", error);
        setUserRole("apprentice");
        setApprenticeHasTrainings(true);
      } finally {
        setIsLoading(false);
      }
    }

    loadNavigationContext();
  }, []);

  const refreshTraineeEnrollment = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabaseClient.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabaseClient
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = (profile?.role as UserRole) || "apprentice";
      if (role !== "apprentice" && role !== "mentor") return;

      const { count, error } = await supabaseClient
        .from("user_trainings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (error) {
        console.error("refreshTraineeEnrollment:", error);
        return;
      }
      setApprenticeHasTrainings((count ?? 0) > 0);
    } catch (e) {
      console.error("refreshTraineeEnrollment:", e);
    }
  }, []);

  const navigationSections = useMemo(
    () =>
      getNavigationSections(userRole, {
        apprenticeHasTrainings: apprenticeHasTrainings ?? true,
      }),
    [userRole, apprenticeHasTrainings]
  );

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);

  const value = useMemo(
    () => ({
      navigationSections,
      isLoading,
      mobileNavOpen,
      setMobileNavOpen,
      openMobileNav,
      refreshTraineeEnrollment,
    }),
    [
      navigationSections,
      isLoading,
      mobileNavOpen,
      openMobileNav,
      refreshTraineeEnrollment,
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
