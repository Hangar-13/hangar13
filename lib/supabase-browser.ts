"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabaseBrowserAuthCookieSerializeOptions } from "@/lib/supabase-ssr-cookie-options";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase environment variables. Please check your .env.local file."
  );
}

// Browser client that automatically includes JWT in all requests
export function createClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey, {
    cookieOptions: supabaseBrowserAuthCookieSerializeOptions(),
  });
}

// Export a singleton instance for convenience
export const supabaseClient = createClient();
