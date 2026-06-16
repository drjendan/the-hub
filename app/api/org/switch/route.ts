import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ORG_COOKIE, getUser, getOrgsForUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * POST /api/org/switch  Body: { org_id }
 * Sets the active-organization cookie after verifying the user is a member.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { org_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orgs = await getOrgsForUser();
  if (!body.org_id || !orgs.some((o) => o.id === body.org_id)) {
    return NextResponse.json({ error: "Not a member of that organization" }, { status: 403 });
  }

  cookies().set(ORG_COOKIE, body.org_id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return NextResponse.json({ ok: true });
}
