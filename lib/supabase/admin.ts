import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. BYPASSES Row Level Security.
 *
 * SERVER ONLY — never import this into a "use client" component. It is used for
 * provider/admin operations that RLS intentionally forbids from the browser:
 * creating organizations, inviting users, and assigning org membership.
 *
 * Every caller MUST verify the signed-in user is an admin (see lib/auth.ts →
 * requireAdmin) before using it.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Admin operations require the service-role key."
    );
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
