"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import {
  DashboardContentFrame,
  DashboardPageShell,
  DashboardSectionLabel,
} from "@/components/dashboard/page-shell";

/**
 * Temporary utility page to delete your own account
 * This should be removed or secured in production
 */
export default function DeleteAccountPage() {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleDeleteAccount = async () => {
    if (
      !confirm(
        "Are you absolutely sure? This will permanently delete your account and all associated data. This action cannot be undone."
      )
    ) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabaseClient.auth.getUser();

      if (userError || !user) {
        setError("You must be logged in to delete your account.");
        setIsDeleting(false);
        return;
      }

      setError(
        "Account deletion must be done via the Supabase Dashboard. Please see DELETE_ACCOUNT.md for instructions."
      );
      setIsDeleting(false);
      return;

      await supabaseClient.auth.signOut();
      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/signup");
      }, 2000);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setIsDeleting(false);
    }
  };

  return (
    <DashboardPageShell className="mx-auto max-w-2xl">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden />
          Delete account
        </h1>
        <p className="text-base text-muted-foreground">
          Permanently delete your account and all associated data
        </p>
      </div>

      <DashboardContentFrame className="space-y-6">
        {error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-md border border-green-500/40 bg-green-50 p-4 dark:bg-green-950/30">
            <p className="text-sm font-medium text-green-900 dark:text-green-100">
              Account deleted. Redirecting to signup…
            </p>
          </div>
        ) : null}

        <section className="space-y-2">
          <DashboardSectionLabel>What will be deleted</DashboardSectionLabel>
          <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
            <li>Your user account</li>
            <li>Your profile information</li>
            <li>All logbook entries</li>
            <li>All progress records</li>
            <li>All other associated data</li>
          </ul>
        </section>

        <section className="space-y-3">
          <DashboardSectionLabel>How to delete your account</DashboardSectionLabel>
          <ol className="list-inside list-decimal space-y-2 text-sm text-muted-foreground">
            <li>
              Go to your Supabase Dashboard:{" "}
              <a
                href="https://app.supabase.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                https://app.supabase.com
              </a>
            </li>
            <li>
              Navigate to <strong>Authentication</strong> → <strong>Users</strong>
            </li>
            <li>
              Find your user account and click <strong>Delete</strong>
            </li>
            <li>Confirm the deletion</li>
            <li>
              Return here or go to <strong>/auth/signup</strong> to create a new account
            </li>
          </ol>
        </section>

        <Button
          onClick={handleDeleteAccount}
          disabled={isDeleting || success}
          variant="destructive"
          className="w-full"
        >
          {isDeleting ? "Deleting..." : "I understand, delete my account"}
        </Button>
      </DashboardContentFrame>
    </DashboardPageShell>
  );
}
