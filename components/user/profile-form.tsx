"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  sendPasswordResetEmail,
  updateUserProfile,
} from "@/app/actions/user-settings";
import { useAppNavigation } from "@/components/app-navigation-provider";

const profileSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Enter a valid email address"),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function ProfileForm({
  initialFullName,
  initialEmail,
}: {
  initialFullName: string;
  initialEmail: string;
}) {
  const { refreshSessionUser } = useAppNavigation();
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: initialFullName,
      email: initialEmail,
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    setProfileMessage(null);
    setProfileError(null);
    setIsSavingProfile(true);

    try {
      const result = await updateUserProfile(data);
      if (result.error) {
        setProfileError(result.error);
        return;
      }

      await refreshSessionUser();
      if (result.emailConfirmationSent) {
        setProfileMessage(
          "Profile updated. Check your inbox to confirm your new email address."
        );
      } else {
        setProfileMessage("Profile updated.");
      }
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordReset = async () => {
    setPasswordMessage(null);
    setPasswordError(null);
    setIsSendingReset(true);

    try {
      const result = await sendPasswordResetEmail();
      if (result.error) {
        setPasswordError(result.error);
        return;
      }
      setPasswordMessage(
        "Password reset email sent. Check your inbox for a link to choose a new password."
      );
    } finally {
      setIsSendingReset(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" autoComplete="name" {...register("fullName")} />
          {errors.fullName ? (
            <p className="text-sm text-destructive">{errors.fullName.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
          />
          {errors.email ? (
            <p className="text-sm text-destructive">{errors.email.message}</p>
          ) : null}
        </div>

        {profileError ? (
          <p className="text-sm text-destructive">{profileError}</p>
        ) : null}
        {profileMessage ? (
          <p className="text-sm text-muted-foreground">{profileMessage}</p>
        ) : null}

        <Button type="submit" disabled={isSavingProfile}>
          {isSavingProfile ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="space-y-3 border-t pt-6">
        <div>
          <h3 className="text-sm font-semibold">Password</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            We&apos;ll email you a secure link to set a new password.
          </p>
        </div>
        {passwordError ? (
          <p className="text-sm text-destructive">{passwordError}</p>
        ) : null}
        {passwordMessage ? (
          <p className="text-sm text-muted-foreground">{passwordMessage}</p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          disabled={isSendingReset}
          onClick={() => void handlePasswordReset()}
        >
          {isSendingReset ? "Sending…" : "Send password reset email"}
        </Button>
      </div>
    </div>
  );
}
