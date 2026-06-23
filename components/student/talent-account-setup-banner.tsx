"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { retryTalentLmsProvisioning } from "@/app/actions/talent-provisioning";
import { Button } from "@/components/ui/button";

/** Failed attempts after which we stop offering retry and point the learner to their admin. */
const MAX_LEARNER_ATTEMPTS = 2;

type Props = {
  /** Failed provisioning attempts recorded so far (from public.users). */
  attempts: number;
};

export function TalentAccountSetupBanner({ attempts: initialAttempts }: Props) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(initialAttempts);
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const exhausted = attempts >= MAX_LEARNER_ATTEMPTS;

  function tryAgain() {
    setError(null);
    startTransition(async () => {
      const res = await retryTalentLmsProvisioning();
      if (res.ok) {
        setSucceeded(true);
        router.refresh();
        return;
      }
      setAttempts(res.attempts);
      setError(res.message);
    });
  }

  if (succeeded) {
    return (
      <div className="relative mb-6 overflow-hidden rounded-md bg-emerald-500/10 px-5 py-4 ring-1 ring-emerald-500/20">
        <div className="absolute inset-y-0 left-0 w-1 bg-emerald-500" aria-hidden />
        <div className="flex items-start gap-2 pl-2">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">Your training account is ready</p>
            <p className="text-sm text-muted-foreground">
              You&apos;re all set — you can now open lessons in TalentLMS.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mb-6 overflow-hidden rounded-md bg-destructive/10 px-5 py-4 ring-1 ring-destructive/20">
      <div className="absolute inset-y-0 left-0 w-1 bg-destructive" aria-hidden />
      <div className="space-y-3 pl-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium">
              We couldn&apos;t finish setting up your training account
            </p>
            <p className="text-sm text-muted-foreground">
              Your TalentLMS account is needed to open lessons. This sometimes fails
              temporarily.{" "}
              {exhausted
                ? "We've tried a couple of times without success — please contact your administrator for help resolving this issue."
                : "You can try again now."}
            </p>
          </div>
        </div>

        {!exhausted ? (
          <Button type="button" size="sm" onClick={tryAgain} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Try again"}
          </Button>
        ) : null}

        {error && !exhausted ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    </div>
  );
}
