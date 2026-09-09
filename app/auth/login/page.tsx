"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabaseClient } from "@/lib/supabaseClient";
import { navigateAfterLogin } from "@/lib/auth-post-login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthContinuing,
  AuthFooterLink,
  AuthShell,
  authButtonClassName,
  authInputClassName,
} from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginForm() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");
  const sessionNotice =
    reason === "session"
      ? "Your session was cleared because it was out of date. Please sign in again."
      : reason === "confirm"
        ? "That confirmation link is invalid or has expired. Sign in to request a new one."
        : null;
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "signing-in" | "opening">("idle");

  useEffect(() => {
    const redirect = searchParams.get("redirect");
    supabaseClient.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setStatus("opening");
        navigateAfterLogin(redirect);
      }
    });
  }, [searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setError(null);
    setStatus("signing-in");

    /** Capture before async work — avoids edge cases where the URL loses ?redirect=. */
    const redirectAfterLogin = searchParams.get("redirect");

    try {
      const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (signInError) {
        setError(signInError.message);
        setStatus("idle");
        return;
      }

      /**
       * Ensure auth cookies/session are flushed before jumping to SAML (full-page navigation).
       * Otherwise Hangar IdP sometimes still sees “no session” on the immediate next request.
       */
      await supabaseClient.auth.getSession();

      setStatus("opening");
      navigateAfterLogin(redirectAfterLogin);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setStatus("idle");
    }
  };

  if (status !== "idle") {
    return (
      <AuthContinuing
        message={
          status === "opening" ? "Opening your workspace…" : "Signing you in…"
        }
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
          Account
        </p>
        <h1 className="text-[2.15rem] font-black uppercase leading-[.9] tracking-[-.06em]">
          Sign in
        </h1>
        <p className="text-sm leading-6 text-[#515860]">
          Open your logbook, coursework, and training record.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {sessionNotice ? (
          <div className="border border-[#121417]/15 bg-white p-3 text-sm text-[#121417]">
            {sessionNotice}
          </div>
        ) : null}
        {error && (
          <div className="border border-red-700/30 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            className={authInputClassName}
            {...register("email")}
            aria-invalid={errors.email ? "true" : "false"}
          />
          {errors.email && (
            <p className="text-sm text-red-700">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/auth/forgot-password"
              className="text-sm font-semibold text-[#0055FF] underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            className={authInputClassName}
            {...register("password")}
            aria-invalid={errors.password ? "true" : "false"}
          />
          {errors.password && (
            <p className="text-sm text-red-700">{errors.password.message}</p>
          )}
        </div>

        <Button type="submit" className={cn("w-full", authButtonClassName)}>
          Sign in
        </Button>
      </form>

      <AuthFooterLink prompt="Don't have an account?" href="/auth/signup" label="Sign up" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense
        fallback={<AuthContinuing message="Loading…" />}
      >
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
