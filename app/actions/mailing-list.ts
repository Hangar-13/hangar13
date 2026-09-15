"use server";

import { z } from "zod";
import { createAdminSupabaseClient } from "@/lib/supabase-admin";

const joinMailingListSchema = z.object({
  fullName: z.string().trim().min(1, "Name is required").max(120),
  email: z.string().trim().email("Please enter a valid email address").max(254),
  audience: z.enum(["mechanic", "operator"]),
  isVeteran: z.boolean(),
  website: z.string().max(200).optional(),
});

export type JoinMailingListInput = z.infer<typeof joinMailingListSchema>;

export type JoinMailingListResult =
  | { ok: true; alreadyJoined?: boolean }
  | { ok: false; error: string };

type CreatePotentialUserRpc = {
  ok?: boolean;
  already_joined?: boolean;
  error?: string;
  id?: string;
};

export async function joinMailingList(
  input: JoinMailingListInput
): Promise<JoinMailingListResult> {
  const parsed = joinMailingListSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return { ok: false, error: first ?? "Please check the form and try again." };
  }

  // Honeypot: bots that fill hidden fields get a fake success and are not stored.
  if (parsed.data.website?.trim()) {
    return { ok: true };
  }

  let supabase;
  try {
    supabase = createAdminSupabaseClient();
  } catch {
    return {
      ok: false,
      error: "Mailing list is not available right now. Please try again later.",
    };
  }

  const { data, error } = await supabase.rpc("create_potential_user_from_landing", {
    p_full_name: parsed.data.fullName,
    p_email: parsed.data.email,
    p_audience: parsed.data.audience,
    p_is_veteran: parsed.data.isVeteran,
  });

  if (error) {
    console.error("joinMailingList rpc failed:", error.message);
    return {
      ok: false,
      error: "Could not join the mailing list. Please try again.",
    };
  }

  const payload = (data ?? {}) as CreatePotentialUserRpc;
  if (payload.ok === false) {
    if (payload.error === "invalid_email") {
      return { ok: false, error: "Please enter a valid email address." };
    }
    if (payload.error === "invalid_name") {
      return { ok: false, error: "Name is required." };
    }
    if (payload.error === "invalid_audience") {
      return { ok: false, error: "Choose mechanic or operator." };
    }
    return { ok: false, error: "Could not join the mailing list. Please try again." };
  }

  return { ok: true, alreadyJoined: payload.already_joined === true };
}
