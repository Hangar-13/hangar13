import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminSupabaseClient } from "@/lib/supabase-admin";
import {
  ensureTalentLmsUserExists,
  getTalentLmsApiEnrollmentConfig,
} from "@/lib/talentlms/api-enroll";

export type TalentLmsProvisionOutcome =
  /** Talent account exists (created now or already present). */
  | { state: "provisioned" }
  /** TalentLMS REST API is not configured — nothing attempted, no failure recorded. */
  | { state: "skipped" }
  /** Creation failed; the failure has been recorded on the user row. */
  | { state: "failed"; status: number; message: string; attempts: number };

type RecordedResult = { status: string; attempts: number };

async function recordProvisionResult(
  supabase: SupabaseClient,
  success: boolean,
  error: string | null
): Promise<RecordedResult> {
  const { data, error: rpcError } = await supabase.rpc(
    "record_talent_lms_provision_result",
    { p_success: success, p_error: error }
  );
  if (rpcError) {
    console.error(
      "[TalentLMS] record_talent_lms_provision_result failed:",
      rpcError.message
    );
  }
  const row = Array.isArray(data) ? (data[0] as RecordedResult | undefined) : null;
  return {
    status: row?.status ?? (success ? "provisioned" : "failed"),
    attempts: Number(row?.attempts ?? 0),
  };
}

/**
 * Create (if missing) the current learner's TalentLMS account and persist the
 * outcome on public.users via {@link recordProvisionResult}. Best-effort: callers
 * should never let provisioning block the signup/confirm flow.
 *
 * - No TalentLMS API key configured → `skipped` (no failure recorded).
 * - Missing email or API error → `failed` (recorded, surfaced via dashboard banner).
 */
export async function provisionTalentLmsAccountForCurrentUser(options: Readonly<{
  supabase: SupabaseClient;
  email: string | null | undefined;
  fullName: string | null | undefined;
}>): Promise<TalentLmsProvisionOutcome> {
  const config = getTalentLmsApiEnrollmentConfig();
  if (!config) {
    return { state: "skipped" };
  }

  const email = (options.email || "").trim().toLowerCase();
  if (!email) {
    console.error("[TalentLMS] account provisioning failed: no email on profile");
    const recorded = await recordProvisionResult(
      options.supabase,
      false,
      "No email on profile."
    );
    return {
      state: "failed",
      status: 400,
      message: "No email on profile.",
      attempts: recorded.attempts,
    };
  }

  const ensured = await ensureTalentLmsUserExists({
    config,
    userEmail: email,
    fullName: options.fullName,
  });

  if (ensured.ok) {
    await recordProvisionResult(options.supabase, true, null);
    return { state: "provisioned" };
  }

  const message = ensured.message || `HTTP ${ensured.status}`;
  console.error(
    "[TalentLMS] account provisioning failed:",
    JSON.stringify({ email, status: ensured.status, message })
  );
  const recorded = await recordProvisionResult(
    options.supabase,
    false,
    `HTTP ${ensured.status}: ${message}`
  );
  return {
    state: "failed",
    status: ensured.status,
    message,
    attempts: recorded.attempts,
  };
}

/**
 * Writes a provisioning outcome for a specific user id using the service-role
 * client (bypasses RLS). Used during admin invites where there is no `auth.uid()`
 * session for the invited user.
 */
async function recordProvisionResultForUserId(
  admin: SupabaseClient,
  userId: string,
  success: boolean,
  error: string | null
): Promise<number> {
  if (success) {
    await admin
      .from("users")
      .update({
        talent_lms_provision_status: "provisioned",
        talent_lms_provisioned_at: new Date().toISOString(),
        talent_lms_provision_last_error: null,
      })
      .eq("id", userId);
    return 0;
  }

  const { data } = await admin
    .from("users")
    .select("talent_lms_provision_attempts")
    .eq("id", userId)
    .maybeSingle();
  const next = Number(data?.talent_lms_provision_attempts ?? 0) + 1;

  await admin
    .from("users")
    .update({
      talent_lms_provision_status: "failed",
      talent_lms_provision_attempts: next,
      talent_lms_provision_last_error: (error ?? "").slice(0, 1000),
    })
    .eq("id", userId);
  return next;
}

/**
 * Create (if missing) the TalentLMS account for a freshly invited user and persist
 * the outcome on their public.users row. Best-effort — callers must not let this
 * block the invite. Safe to call only after the invite created the auth user.
 */
export async function provisionTalentLmsAccountForInvitedUser(options: Readonly<{
  userId: string;
  email: string | null | undefined;
  fullName: string | null | undefined;
}>): Promise<TalentLmsProvisionOutcome> {
  const config = getTalentLmsApiEnrollmentConfig();
  if (!config) {
    return { state: "skipped" };
  }

  let admin: SupabaseClient;
  try {
    admin = createAdminSupabaseClient();
  } catch {
    return { state: "skipped" };
  }

  const email = (options.email || "").trim().toLowerCase();
  if (!email) {
    console.error(
      "[TalentLMS] invite provisioning failed: no email",
      JSON.stringify({ userId: options.userId })
    );
    const attempts = await recordProvisionResultForUserId(
      admin,
      options.userId,
      false,
      "No email on profile."
    );
    return { state: "failed", status: 400, message: "No email on profile.", attempts };
  }

  const ensured = await ensureTalentLmsUserExists({
    config,
    userEmail: email,
    fullName: options.fullName,
  });

  if (ensured.ok) {
    await recordProvisionResultForUserId(admin, options.userId, true, null);
    return { state: "provisioned" };
  }

  const message = ensured.message || `HTTP ${ensured.status}`;
  console.error(
    "[TalentLMS] invite provisioning failed:",
    JSON.stringify({ userId: options.userId, email, status: ensured.status, message })
  );
  const attempts = await recordProvisionResultForUserId(
    admin,
    options.userId,
    false,
    `HTTP ${ensured.status}: ${message}`
  );
  return { state: "failed", status: ensured.status, message, attempts };
}
