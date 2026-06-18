import { NextResponse } from "next/server";
import { currentSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function slugify(name: string, fallback: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || fallback
  );
}

async function insertWithUniqueSlug(
  db: ReturnType<typeof createAdminClient>,
  table: "accounts" | "organizations",
  base: string,
  extra: Record<string, unknown>,
  select: string
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await db.from(table).insert({ ...extra, slug }).select(select).single();
    if (!error) return { data: data as unknown as Record<string, string>, error: null };
    if (error.code !== "23505") return { data: null, error: { message: error.message } };
  }
  return { data: null, error: { message: "Could not generate a unique slug" } };
}

/**
 * POST /api/platform/accounts
 *   Body: { name, first_workspace_name?, owner_email? }
 * Creates an account (the customer/holding entity). PLATFORM-SUPER-ADMIN ONLY.
 * Optionally creates its first workspace (a holding account may have none) and
 * seeds an account OWNER by email (existing profile → assigned; else invited).
 */
export async function POST(req: Request) {
  const su = await currentSuperAdmin();
  if (!su) return NextResponse.json({ error: "Platform super-admin access required" }, { status: 403 });

  let body: { name?: string; first_workspace_name?: string; owner_email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Account name is required" }, { status: 400 });
  const ownerEmail = (body.owner_email || "").trim().toLowerCase();
  if (ownerEmail && !ownerEmail.includes("@")) {
    return NextResponse.json({ error: "Owner email is not a valid address" }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: account, error: acctErr } = await insertWithUniqueSlug(
    db,
    "accounts",
    slugify(name, "account"),
    { name },
    "id, name, slug"
  );
  if (acctErr || !account) {
    return NextResponse.json({ error: acctErr?.message || "Could not create account" }, { status: 500 });
  }

  // Optional first workspace.
  let workspace: unknown = null;
  const wsName = (body.first_workspace_name || "").trim();
  if (wsName) {
    const { data: ws, error: wsErr } = await insertWithUniqueSlug(
      db,
      "organizations",
      slugify(wsName, "workspace"),
      { account_id: account.id, name: wsName, governance_mode: "standard" },
      "id, name, slug, account_id"
    );
    if (wsErr) return NextResponse.json({ account, owner_error: wsErr.message }, { status: 207 });
    workspace = ws;
  }

  // Optional account owner.
  let ownerStatus: "assigned" | "invited" | null = null;
  if (ownerEmail) {
    let userId: string | null = null;
    const { data: existing } = await db.from("profiles").select("id").eq("email", ownerEmail).maybeSingle();
    if (existing) {
      userId = existing.id;
      ownerStatus = "assigned";
    } else {
      const { data: invite, error: inviteErr } = await db.auth.admin.inviteUserByEmail(ownerEmail);
      if (inviteErr || !invite?.user) {
        return NextResponse.json(
          { account, workspace, owner_error: "Account created, but the owner could not be invited. " + (inviteErr?.message ?? "") },
          { status: 207 }
        );
      }
      userId = invite.user.id;
      ownerStatus = "invited";
    }
    const { error: amErr } = await db
      .from("account_members")
      .insert({ account_id: account.id, user_id: userId!, account_role: "owner" });
    if (amErr && amErr.code !== "23505") {
      return NextResponse.json({ account, workspace, owner_error: amErr.message }, { status: 207 });
    }
  }

  return NextResponse.json({ account, workspace, owner_status: ownerStatus });
}
