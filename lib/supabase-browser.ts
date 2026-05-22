"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

import { supabaseBrowserAuthCookieSerializeOptions } from "@/lib/supabase-ssr-cookie-options";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check your .env.local file."
  );
}

let browserClientSingleton: SupabaseClient | null = null;

/**
 * Singleton browser client — initialized lazily on first access in the browser so
 * `SameSite` / `Secure` cookie options reflect the real `window.location` protocol
 * (not SSR / import evaluation with `undefined` window).
 */
export function getBrowserSupabaseClient(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error(
      "getBrowserSupabaseClient() must only run in the browser — use createServerSupabaseClient on the server."
    );
  }

  browserClientSingleton ??= createBrowserClient(supabaseUrl, supabasePublishableKey, {
    cookieOptions: supabaseBrowserAuthCookieSerializeOptions(),
  });

  return browserClientSingleton;
}

/** Convenience alias matching Supabase SSR docs naming. */
export function createClient(): SupabaseClient {
  return getBrowserSupabaseClient();
}

/**
 * Back-compat singleton: **lazy** on first property access — avoids wrong cookie attrs
 * baked in during module initialization before `window` exists on some bundler paths.
 */
export const supabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop /*, receiver */) {
    const client = getBrowserSupabaseClient();
    const value = Reflect.get(client, prop, client) as unknown;
    return typeof value === "function"
      ? (value as (...a: unknown[]) => unknown).bind(client)
      : value;
  },
}) as SupabaseClient;
