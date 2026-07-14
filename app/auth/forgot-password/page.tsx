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
    <div
      className="relative flex min-h-screen flex-col items-center justify-center p-4 overflow-hidden"
      data-auth-page
    >
      <div className="fixed inset-0 -z-10">
        <img
          src="/images/helicopterMaintenanceSunset.jpeg"
          alt="Helicopter maintenance at sunset"
          className="w-full h-full object-cover"
          style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%" }}
        />
      </div>
      <div className="absolute inset-0 bg-background/50 backdrop-blur-sm -z-10" />
      <div className="relative w-full max-w-md space-y-8 mb-8 flex justify-center">
        <img
          src="/images/hangar13Logo.png"
          alt="Hangar 13"
          className="h-24 md:h-32 w-auto object-contain drop-shadow-lg"
        />
      </div>

      <div className="relative w-full max-w-md space-y-8 rounded-xl border border-border/50 bg-white p-8 shadow-2xl">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Reset your password</h1>
          <p className="text-muted-foreground text-sm">
            {submittedEmail
              ? "Check your inbox for a link to choose a new password."
              : "Enter your email and we\u2019ll send you a reset link."}
          </p>
        </div>

        {submittedEmail ? (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/50 p-3 text-sm text-foreground">
              If an account exists for{" "}
              <span className="font-medium">{submittedEmail}</span>, you&apos;ll receive an
              email shortly. The link expires after a short time.
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link href="/auth/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
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
                {...register("email")}
                aria-invalid={errors.email ? "true" : "false"}
              />
              {errors.email ? (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              ) : null}
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Sending…" : "Send reset link"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              <Link href="/auth/login" className="text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
