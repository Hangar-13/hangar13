"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { fetchSessionUserProfile } from "@/lib/session-user-profile";
import {
  normalizeUserStartPath,
  isAllowedStartPath,
  roleDefaultStartPath,
} from "@/lib/user-start-path";
import {
  highestOrganizationRole,
  normalizeOrganizationRole,
  normalizeSystemRole,
} from "@/lib/auth-shared";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { passwordResetRedirectUrl } from "@/lib/password-reset-redirect-url";

export type UserSettingsPayload = {
  fullName: string | null;
  email: string | null;
  defaultStartPath: string | null;
  roleDefaultStartPath: string;
};

export async function getUserSettings(): Promise<
  UserSettingsPayload | { error: string }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const profile = await fetchSessionUserProfile(supabase);
  if (!profile) {
    return { error: "Profile could not be loaded." };
  }

  const { data: memberships } = await supabase
    .from("user_organizations")
    .select("role")
    .eq("user_id", user.id);

  const orgRoles = (memberships ?? []).map((m) =>
    normalizeOrganizationRole(m.role as string)
  );
  const highestOrgRole =
    orgRoles.length > 0 ? highestOrganizationRole(orgRoles) : null;
  const systemRole = normalizeSystemRole(profile.role as string | undefined);

  return {
    fullName: profile.full_name,
    email: profile.email ?? user.email ?? null,
    defaultStartPath: profile.default_start_path,
    roleDefaultStartPath: roleDefaultStartPath(systemRole, highestOrgRole),
  };
}

export async function updateUserProfile(input: {
  fullName: string;
  email: string;
}): Promise<{ error?: string; emailConfirmationSent?: boolean }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName) {
    return { error: "Name is required." };
  }
  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email address." };
  }

  const profile = await fetchSessionUserProfile(supabase);
  const currentEmail = (profile?.email ?? user.email ?? "").toLowerCase();
  const emailChanged = email !== currentEmail;

  const { error: profileError } = await supabase
    .from("users")
    .update({ full_name: fullName, email })
    .eq("id", user.id);

  if (profileError) {
    return { error: profileError.message };
  }

  if (emailChanged) {
    const { error: authError } = await supabase.auth.updateUser({ email });
    if (authError) {
      return { error: authError.message };
    }
  } else {
    const { error: metaError } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });
    if (metaError) {
      return { error: metaError.message };
    }
  }

  revalidatePath("/dashboard/profile");
  revalidatePath("/dashboard/preferences");

  return { emailConfirmationSent: emailChanged };
}

export async function sendPasswordResetEmail(): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  const profile = await fetchSessionUserProfile(supabase);
  const email = profile?.email ?? user.email;
  if (!email) {
    return { error: "No email address on file." };
  }

  const redirectTo = await passwordResetRedirectUrl();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    return { error: error.message };
  }

  return {};
}

export async function updateDefaultStartPath(
  input: string | null
): Promise<{ error?: string; savedPath?: string | null }> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: "Not authenticated." };
  }

  let savedPath: string | null = null;

  if (input != null && input.trim()) {
    const headerStore = await headers();
    const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
    const protocol = headerStore.get("x-forwarded-proto") ?? "https";
    const origin = host ? `${protocol}://${host}` : undefined;

    const normalized = normalizeUserStartPath(input, origin);
    if (!normalized || !isAllowedStartPath(normalized)) {
      return {
        error:
          "Enter a valid dashboard path (for example /dashboard/student/logbook).",
      };
    }
    savedPath = normalized;
  }

  const { error } = await supabase
    .from("users")
    .update({ default_start_path: savedPath })
    .eq("id", user.id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/dashboard/preferences");
  revalidatePath("/");

  return { savedPath };
}
