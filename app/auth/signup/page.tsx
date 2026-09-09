"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabaseClient } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AuthFooterLink,
  AuthShell,
  authButtonClassName,
  authInputClassName,
} from "@/components/auth/auth-shell";
import { cn } from "@/lib/utils";

const signupSchema = z
  .object({
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Please enter a valid email address"),
    password: z
      .string()
      .min(6, "Password must be at least 6 characters")
      .regex(
        /(?=.*[a-z])(?=.*[A-Z])/,
        "Password must contain at least one uppercase and one lowercase letter"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    setError(null);
    setIsLoading(true);

    try {
      const emailRedirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/confirm`
          : undefined;

      const { error: signUpError } = await supabaseClient.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          // Role is intentionally NOT sent here — new accounts are always created
          // as standard users. Platform roles are assigned by admins after signup.
          data: {
            full_name: `${data.firstName} ${data.lastName}`,
          },
          emailRedirectTo,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }

      // Email confirmation is required, so there is no session yet. Show the
      // "check your inbox" state instead of routing into the app.
      setConfirmEmail(data.email);
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      {confirmEmail ? (
        <div className="space-y-6">
          <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
            Account
          </p>
          <h1 className="text-[2.15rem] font-black uppercase leading-[.9] tracking-[-.06em]">
            Confirm your email
          </h1>
          <p className="text-sm leading-6 text-[#515860]">
            We sent a confirmation link to{" "}
            <span className="font-semibold text-[#121417]">{confirmEmail}</span>. Click
            the link in that email to activate your account and sign in.
          </p>
          <p className="text-xs leading-5 text-[#515860]">
            Don&apos;t see it? Check your spam folder. The link expires after a while,
            so confirm soon.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex text-sm font-semibold text-[#0055FF] underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="space-y-3">
            <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
              Account
            </p>
            <h1 className="text-[2.15rem] font-black uppercase leading-[.9] tracking-[-.06em]">
              Create an account
            </h1>
            <p className="text-sm leading-6 text-[#515860]">
              Start a portable OJT record — then add coursework when you need it.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="border border-red-700/30 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  type="text"
                  placeholder="John"
                  className={authInputClassName}
                  {...register("firstName")}
                  aria-invalid={errors.firstName ? "true" : "false"}
                />
                {errors.firstName && (
                  <p className="text-sm text-red-700">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  type="text"
                  placeholder="Doe"
                  className={authInputClassName}
                  {...register("lastName")}
                  aria-invalid={errors.lastName ? "true" : "false"}
                />
                {errors.lastName && (
                  <p className="text-sm text-red-700">{errors.lastName.message}</p>
                )}
              </div>
            </div>

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
              <Label htmlFor="password">Password</Label>
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
              <p className="text-xs text-[#515860]">
                Must be at least 6 characters with uppercase and lowercase letters
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                className={authInputClassName}
                {...register("confirmPassword")}
                aria-invalid={errors.confirmPassword ? "true" : "false"}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-red-700">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <Button type="submit" className={cn("w-full", authButtonClassName)} disabled={isLoading}>
              {isLoading ? "Creating account..." : "Create account"}
            </Button>
          </form>

          <AuthFooterLink prompt="Already have an account?" href="/auth/login" label="Sign in" />
        </div>
      )}
    </AuthShell>
  );
}
