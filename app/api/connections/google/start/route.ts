import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getUser } from "@/lib/auth";
import { googleOAuthConfigured, buildConsentUrl } from "@/lib/google";
import { appUrl } from "@/lib/google";

export const runtime = "nodejs";

/**
 * GET /api/connections/google/start?next=/hub/<slug>
 * Kicks off Gmail OAuth: sets a CSRF nonce cookie and redirects to Google's
 * consent screen. Returns to `next` after the callback.
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${appUrl()}/login`);

  const url = new URL(req.url);
  const next = url.searchParams.get("next") || "/";

  if (!googleOAuthConfigured()) {
    return NextResponse.redirect(`${appUrl()}${next}?connect_error=not_configured`);
  }

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({ nonce, next }), "utf8").toString("base64url");

  cookies().set("g_oauth_state", nonce, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildConsentUrl(state));
}
