import { NextResponse } from "next/server";
import { currentAccountAdmin, adminAccountForWorkspace } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * POST /api/portfolio/compliance  Body: { organization_id, pack_id, enabled: boolean }
 * Assigns/unassigns a compliance pack to a single workspace (e.g. HIPAA to one
 * subsidiary, not others). adminAccountForWorkspace pins the action to the
 * workspace's account, so the caller can only touch their own account's workspaces.
 */
export async function POST(req: Request) {
  const admin = await currentAccountAdmin();
  if (!admin) return NextResponse.json({ error: "Account admin access required" }, { status: 403 });

  let body: { organization_id?: string; pack_id?: string; enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orgId = (body.organization_id || "").trim();
  const packId = (body.pack_id || "").trim();
  if (!orgId || !packId)
    return NextResponse.json({ error: "organization_id and pack_id are required" }, { status: 400 });
  if (!(await adminAccountForWorkspace(admin.user.id, orgId))) {
    return NextResponse.json({ error: "That workspace is not in an account you administer" }, { status: 403 });
  }

  const db = createAdminClient();
  if (body.enabled) {
    const { error } = await db
      .from("org_compliance_packs")
      .insert({ organization_id: orgId, pack_id: packId, enabled_by: admin.user.id });
    if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db
      .from("org_compliance_packs")
      .delete()
      .eq("organization_id", orgId)
      .eq("pack_id", packId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
