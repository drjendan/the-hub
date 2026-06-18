import { NextResponse } from "next/server";
import { currentSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace"
  );
}

/**
 * POST /api/platform/orgs  Body: { account_id, name, industry?, size_band? }
 *
 * Creates a WORKSPACE under an existing account. PLATFORM-SUPER-ADMIN ONLY.
 * (Account creation lives in /api/platform/accounts.) The super-admin is not
 * added as a member — the portal sees everything via the service role.
 */
export async function POST(req: Request) {
  const su = await currentSuperAdmin();
  if (!su) return NextResponse.json({ error: "Platform super-admin access required" }, { status: 403 });

  let body: { account_id?: string; name?: string; industry?: string; size_band?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountId = (body.account_id || "").trim();
  const name = (body.name || "").trim();
  if (!accountId) return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Workspace name is required" }, { status: 400 });

  const db = createAdminClient();

  // Make sure the account exists (FK would catch it too, but a clear error is nicer).
  const { data: account } = await db.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await db
      .from("organizations")
      .insert({
        account_id: accountId,
        name,
        slug,
        industry: body.industry || null,
        size_band: body.size_band || null,
        governance_mode: "standard",
      })
      .select("id, name, slug, account_id")
      .single();
    if (!error) return NextResponse.json({ workspace: data });
    if (error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: "Could not generate a unique slug" }, { status: 409 });
}

/**
 * DELETE /api/platform/orgs  Body: { id }
 * Permanently deletes a workspace and all its data (agents, apps, members, local
 * policies, runs, sessions, KB, BYOK key, …) via the on-delete-cascade FKs.
 * PLATFORM-SUPER-ADMIN ONLY. Irreversible.
 */
export async function DELETE(req: Request) {
  const su = await currentSuperAdmin();
  if (!su) return NextResponse.json({ error: "Platform super-admin access required" }, { status: 403 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db.from("organizations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
