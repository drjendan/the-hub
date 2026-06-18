import { NextResponse } from "next/server";
import { currentSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ACCOUNT_ROLES = ["owner", "admin"] as const;
type AccountRoleT = (typeof ACCOUNT_ROLES)[number];

/**
 * POST /api/platform/account-members  Body: { account_id, email, account_role? }
 * Adds an account admin. Existing profile → assigned; otherwise invited by email.
 * PLATFORM-SUPER-ADMIN ONLY. account_role: 'owner' (can manage account members)
 * or 'admin' (full rollup). Defaults to 'admin'.
 */
export async function POST(req: Request) {
  const su = await currentSuperAdmin();
  if (!su) return NextResponse.json({ error: "Platform super-admin access required" }, { status: 403 });

  let body: { account_id?: string; email?: string; account_role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const accountId = (body.account_id || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const role: AccountRoleT = ACCOUNT_ROLES.includes(body.account_role as AccountRoleT)
    ? (body.account_role as AccountRoleT)
    : "admin";
  if (!accountId) return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  if (!email || !email.includes("@"))
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });

  const db = createAdminClient();

  const { data: account } = await db.from("accounts").select("id").eq("id", accountId).maybeSingle();
  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

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

  const { error } = await db
    .from("account_members")
    .insert({ account_id: accountId, user_id: userId!, account_role: role });
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    status: invited ? "invited" : "assigned",
    already: error?.code === "23505",
  });
}

/**
 * DELETE /api/platform/account-members  Body: { account_id, user_id }
 * Removes an account admin. PLATFORM-SUPER-ADMIN ONLY.
 */
export async function DELETE(req: Request) {
  const su = await currentSuperAdmin();
  if (!su) return NextResponse.json({ error: "Platform super-admin access required" }, { status: 403 });

  let body: { account_id?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.account_id || !body.user_id)
    return NextResponse.json({ error: "account_id and user_id are required" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db
    .from("account_members")
    .delete()
    .eq("account_id", body.account_id)
    .eq("user_id", body.user_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
