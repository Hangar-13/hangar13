"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { requestPasswordResetEmail } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthShell,
  authButtonClassName,
  authInputClassName,
} from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setError(null);
    setIsLoading(true);

    try {
      const result = await requestPasswordResetEmail({ email: data.email });
      if (result.error) {
        setError(result.error);
        return;
      }

      setSubmittedEmail(data.email.trim());
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
            Account
          </p>
          <h1 className="text-[2.15rem] font-black uppercase leading-[.9] tracking-[-.06em]">
            Reset your password
          </h1>
          <p className="text-sm leading-6 text-[#515860]">
            {submittedEmail
              ? "Check your inbox for a link to choose a new password."
              : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {submittedEmail ? (
          <div className="space-y-4">
            <div className="border border-[#121417]/15 bg-white p-3 text-sm text-[#121417]">
              If an account exists for{" "}
              <span className="font-medium">{submittedEmail}</span>, you&apos;ll receive an
              email shortly. The link expires after a short time.
            </div>
            <Button asChild className={cn("w-full", authButtonClassName)}>
              <Link href="/auth/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error ? (
              <div className="border border-red-700/30 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={authInputClassName}
                {...register("email")}
                aria-invalid={errors.email ? "true" : "false"}
              />
              {errors.email ? (
                <p className="text-sm text-red-700">{errors.email.message}</p>
              ) : null}
            </div>

            <Button type="submit" className={cn("w-full", authButtonClassName)} disabled={isLoading}>
              {isLoading ? "Sending…" : "Send reset link"}
            </Button>

            <p className="text-center text-sm">
              <Link href="/auth/login" className="font-semibold text-[#0055FF] underline-offset-4 hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </AuthShell>
  );
}
