"use client";

import { useEffect } from "react";
import { AuthContinuing, AuthShell } from "@/components/auth/auth-shell";
import { supabaseClient } from "@/lib/supabaseClient";

/**
 * Signed-in users are redirected by middleware to their dashboard.
 * This page is the loading bridge after password sign-in.
 */
export default function AuthContinuePage() {
  useEffect(() => {
    void supabaseClient.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        window.location.replace("/auth/login");
      }
    });
  }, []);

  return (
    <AuthShell>
      <AuthContinuing message="Opening your workspace…" />
    </AuthShell>
  );
}
