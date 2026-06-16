import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser, getCurrentOrgId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret } from "@/lib/crypto";
import { exchangeCode, getUserEmail, appUrl } from "@/lib/google";

export const runtime = "nodejs";

/**
 * GET /api/connections/google/callback
 * Google redirects here with ?code & ?state. We verify CSRF, exchange the code
 * for tokens, encrypt them, and upsert the user's Gmail connection.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const fail = (next: string, reason: string) =>
    NextResponse.redirect(`${appUrl()}${next}?connect_error=${encodeURIComponent(reason)}`);

  // Decode state to recover the return path.
  let next = "/";
  let nonce = "";
  try {
    const parsed = JSON.parse(Buffer.from(state || "", "base64url").toString("utf8"));
    next = typeof parsed.next === "string" ? parsed.next : "/";
    nonce = parsed.nonce || "";
  } catch {
    return fail("/", "bad_state");
  }

  if (oauthError) return fail(next, oauthError);
  if (!code) return fail(next, "missing_code");

  // CSRF: state nonce must match the cookie we set in /start.
  const cookieNonce = cookies().get("g_oauth_state")?.value;
  cookies().delete("g_oauth_state");
  if (!cookieNonce || cookieNonce !== nonce) return fail(next, "state_mismatch");

  const user = await getUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/login`);

  let tokens;
  try {
    tokens = await exchangeCode(code);
  } catch {
    return fail(next, "token_exchange_failed");
  }

  const accountEmail = await getUserEmail(tokens.access_token);
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  const row: Record<string, unknown> = {
    user_id: user.id,
    organization_id: orgId,
    provider: "google",
    account_email: accountEmail,
    access_token: encryptSecret(tokens.access_token),
    token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    scopes: tokens.scope,
  };
  // Only overwrite the refresh token when Google returns a new one.
  if (tokens.refresh_token) row.refresh_token = encryptSecret(tokens.refresh_token);

  const { error } = await supabase
    .from("connections")
    .upsert(row, { onConflict: "user_id,provider" });
  if (error) return fail(next, "save_failed");

  return NextResponse.redirect(`${appUrl()}${next}?connected=gmail`);
}
