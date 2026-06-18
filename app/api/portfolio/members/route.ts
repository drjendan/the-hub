import { NextResponse } from "next/server";
import { currentAccountAdmin, adminAccountForWorkspace } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgRole } from "@/lib/supabase/types";

export const runtime = "nodejs";

const ORG_ROLES: OrgRole[] = ["owner", "manager", "staff"];

/**
 * POST /api/portfolio/members  Body: { organization_id, email, org_role? }
 * The account admin assigns a person to a SPECIFIC workspace. adminAccountForWorkspace
 * pins the action to the workspace's account: the caller must administer the account
 * that owns the target workspace, so a person can only ever be assigned within the
 * caller's own account. Existing profile → assigned; otherwise invited by email.
 */
export async function POST(req: Request) {
  const admin = await currentAccountAdmin();
  if (!admin) return NextResponse.json({ error: "Account admin access required" }, { status: 403 });

  let body: { organization_id?: string; email?: string; org_role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orgId = (body.organization_id || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const orgRole: OrgRole = ORG_ROLES.includes(body.org_role as OrgRole)
    ? (body.org_role as OrgRole)
    : "staff";
  if (!orgId) return NextResponse.json({ error: "organization_id is required" }, { status: 400 });
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  if (!(await adminAccountForWorkspace(admin.user.id, orgId))) {
    return NextResponse.json({ error: "That workspace is not in an account you administer" }, { status: 403 });
  }

  const db = createAdminClient();

  let userId: string | null = null;
  let invited = false;
  const { data: existing } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
  if (existing) {
    userId = existing.id;
  } else {
    const { data: invite, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email);
    if (inviteErr || !invite?.user) {
      return NextResponse.json(
        {
          error:
            "Could not invite this user. Ensure email sending is configured in Supabase Auth, or have them sign up first. " +
            (inviteErr?.message ?? ""),
        },
        { status: 502 }
      );
    }
    userId = invite.user.id;
    invited = true;
  }

  // Let new members build agents (member → builder); default them into this workspace.
  const { data: prof } = await db
    .from("profiles")
    .select("id, app_role, default_org_id")
    .eq("id", userId!)
    .maybeSingle();
  const patch: Record<string, unknown> = {};
  if (!prof || prof.app_role === "member") patch.app_role = "builder";
  if (prof && !prof.default_org_id) patch.default_org_id = orgId;
  if (Object.keys(patch).length > 0) await db.from("profiles").update(patch).eq("id", userId!);

  const { error: memberErr } = await db
    .from("org_members")
    .insert({ organization_id: orgId, user_id: userId!, org_role: orgRole });
  if (memberErr && memberErr.code !== "23505") {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: invited ? "invited" : "assigned",
    already: memberErr?.code === "23505",
  });
}

/**
 * DELETE /api/portfolio/members  Body: { organization_id, user_id }
 * Unassigns a person from a workspace (account-pinned, same as POST).
 */
export async function DELETE(req: Request) {
  const admin = await currentAccountAdmin();
  if (!admin) return NextResponse.json({ error: "Account admin access required" }, { status: 403 });

  let body: { organization_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orgId = (body.organization_id || "").trim();
  if (!orgId || !body.user_id)
    return NextResponse.json({ error: "organization_id and user_id are required" }, { status: 400 });
  if (!(await adminAccountForWorkspace(admin.user.id, orgId))) {
    return NextResponse.json({ error: "That workspace is not in an account you administer" }, { status: 403 });
  }

  const db = createAdminClient();
  const { error } = await db
    .from("org_members")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", body.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
