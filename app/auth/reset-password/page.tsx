"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { navigateAfterLogin } from "@/lib/auth-post-login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthContinuing,
  AuthShell,
  authButtonClassName,
  authInputClassName,
} from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

const resetSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof resetSchema>;

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "opening">("idle");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetFormData) => {
    setError(null);
    setStatus("saving");

    try {
      const { error: updateError } = await supabaseClient.auth.updateUser({
        password: data.password,
      });

      if (updateError) {
        setError(updateError.message);
        setStatus("idle");
        return;
      }

      await supabaseClient.auth.getSession();
      setStatus("opening");
      navigateAfterLogin(null);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setStatus("idle");
    }
  };

  if (status !== "idle") {
    return (
      <AuthShell>
        <AuthContinuing
          title="Set a new password"
          message={
            status === "opening"
              ? "Opening your workspace…"
              : "Updating your password…"
          }
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
            Account
          </p>
          <h1 className="text-[2.15rem] font-black uppercase leading-[.9] tracking-[-.06em]">
            Set a new password
          </h1>
          <p className="text-sm leading-6 text-[#515860]">
            Choose a new password for your account.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              className={authInputClassName}
              {...register("password")}
            />
            {errors.password ? (
              <p className="text-sm text-red-700">{errors.password.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className={authInputClassName}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword ? (
              <p className="text-sm text-red-700">
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>

          {error ? <p className="text-sm text-red-700">{error}</p> : null}

          <Button type="submit" className={cn("w-full", authButtonClassName)}>
            Update password
          </Button>
        </form>

        <p className="text-center text-sm">
          <Link href="/auth/login" className="font-semibold text-[#0055FF] underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
