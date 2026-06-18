import { NextResponse } from "next/server";
import { currentAccountAdmin, isAccountAdmin } from "@/lib/auth";
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
 * POST /api/portfolio/workspaces  Body: { account_id, name, industry?, size_band? }
 * Creates a workspace under an account the caller administers. Gated by
 * currentAccountAdmin() + an explicit isAccountAdmin(account_id) check before the
 * service client touches anything, so an account admin can only add workspaces to
 * THEIR OWN account.
 */
export async function POST(req: Request) {
  const admin = await currentAccountAdmin();
  if (!admin) return NextResponse.json({ error: "Account admin access required" }, { status: 403 });

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
  if (!(await isAccountAdmin(admin.user.id, accountId))) {
    return NextResponse.json({ error: "You do not administer this account" }, { status: 403 });
  }

  const db = createAdminClient();
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
