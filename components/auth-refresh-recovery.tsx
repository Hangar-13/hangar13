"use client";

import { useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

/**
 * Clears invalid/stale Supabase sessions that cause
 * "Invalid Refresh Token: Refresh Token Not Found" in the console.
 */
export function AuthRefreshRecovery() {
  useEffect(() => {
    let cancelled = false;

    async function recover() {
      const { error } = await supabaseClient.auth.getSession();
      if (cancelled || !error) return;

      const msg = error.message?.toLowerCase() ?? "";
      const isRefreshTokenMissing =
        msg.includes("refresh token not found") ||
        msg.includes("invalid refresh token");
      if (!isRefreshTokenMissing) {
        return;
      }

      await supabaseClient.auth.signOut({ scope: "local" });

      const path = window.location.pathname;
      if (path.startsWith("/auth")) return;

      const next = encodeURIComponent(path + window.location.search);
      window.location.href = `/auth/login?reason=session&redirect=${next}`;
    }

    void recover();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
