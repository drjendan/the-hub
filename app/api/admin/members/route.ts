import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrgRole } from "@/lib/supabase/types";

export const runtime = "nodejs";

const ORG_ROLES: OrgRole[] = ["owner", "manager", "staff"];

/**
 * POST /api/admin/members  Body: { org_id, email, org_role? }
 * Assigns a user to a company. If the user already exists, they're assigned
 * directly; otherwise they're invited by email (Supabase Auth invite). New
 * company users default to the global "builder" app_role so they can create
 * agents under RLS. Service-role only.
 */
export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let body: { org_id?: string; email?: string; org_role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const orgId = body.org_id;
  const orgRole: OrgRole = ORG_ROLES.includes(body.org_role as OrgRole)
    ? (body.org_role as OrgRole)
    : "staff";

  if (!orgId) return NextResponse.json({ error: "org_id is required" }, { status: 400 });
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const db = createAdminClient();

  // Make sure the org exists.
  const { data: org } = await db
    .from("organizations")
    .select("id, name")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Find an existing profile by email, else invite a new auth user.
  let userId: string | null = null;
  let invited = false;

  const { data: existing } = await db
    .from("profiles")
    .select("id, app_role")
    .eq("email", email)
    .maybeSingle();

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

  // Ensure they can build agents: promote 'member' → 'builder' (don't touch
  // admins/reviewers). The DB guard trigger allows this from the service role.
  const { data: prof } = await db
    .from("profiles")
    .select("id, app_role, default_org_id")
    .eq("id", userId!)
    .maybeSingle();
  const patch: Record<string, unknown> = {};
  if (!prof || prof.app_role === "member") patch.app_role = "builder";
  if (prof && !prof.default_org_id) patch.default_org_id = orgId;
  if (Object.keys(patch).length > 0) {
    await db.from("profiles").update(patch).eq("id", userId!);
  }

  // Assign membership.
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
 * DELETE /api/admin/members  Body: { org_id, user_id }
 * Removes a user from a company. Service-role only.
 */
export async function DELETE(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let body: { org_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.org_id || !body.user_id)
    return NextResponse.json({ error: "org_id and user_id are required" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db
    .from("org_members")
    .delete()
    .eq("organization_id", body.org_id)
    .eq("user_id", body.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
