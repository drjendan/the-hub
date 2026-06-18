import { NextResponse } from "next/server";
import { currentAccountAdmin, isAccountAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Workspace ids that belong to the given account (the only valid mapping targets). */
async function workspaceIdsForAccount(
  db: ReturnType<typeof createAdminClient>,
  accountId: string
): Promise<Set<string>> {
  const { data } = await db.from("organizations").select("id").eq("account_id", accountId);
  return new Set(((data as { id: string }[] | null) || []).map((o) => o.id));
}

/**
 * POST /api/portfolio/policies
 *   Body: { account_id, title, body?, category?, workspace_ids?: string[] }
 * Creates an ACCOUNT-level policy and maps it to the chosen workspaces. Only
 * workspaces belonging to that account are accepted (cross-account governance
 * is impossible). Caller must administer the account.
 */
export async function POST(req: Request) {
  const admin = await currentAccountAdmin();
  if (!admin) return NextResponse.json({ error: "Account admin access required" }, { status: 403 });

  let body: { account_id?: string; title?: string; body?: string; category?: string; workspace_ids?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const accountId = (body.account_id || "").trim();
  const title = (body.title || "").trim();
  if (!accountId) return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  if (!title) return NextResponse.json({ error: "A policy title is required" }, { status: 400 });
  if (!(await isAccountAdmin(admin.user.id, accountId))) {
    return NextResponse.json({ error: "You do not administer this account" }, { status: 403 });
  }

  const db = createAdminClient();
  const { data: policy, error } = await db
    .from("policies")
    .insert({ account_id: accountId, organization_id: null, title, body: body.body || null, category: body.category || null })
    .select("id, account_id, title, body, category, active, created_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const valid = await workspaceIdsForAccount(db, accountId);
  const targets = (body.workspace_ids || []).filter((id) => valid.has(id));
  if (targets.length > 0) {
    const { error: mapErr } = await db
      .from("policy_workspaces")
      .insert(targets.map((organization_id) => ({ policy_id: policy.id, organization_id })));
    if (mapErr) return NextResponse.json({ error: mapErr.message }, { status: 500 });
  }
  return NextResponse.json({ policy, mapped: targets.length });
}

/**
 * PUT /api/portfolio/policies  Body: { policy_id, organization_id, apply: boolean }
 * Toggles whether an account policy applies to one workspace. Verifies the policy
 * is account-level, the caller administers its account, and the workspace belongs
 * to that same account.
 */
export async function PUT(req: Request) {
  const admin = await currentAccountAdmin();
  if (!admin) return NextResponse.json({ error: "Account admin access required" }, { status: 403 });

  let body: { policy_id?: string; organization_id?: string; apply?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const policyId = (body.policy_id || "").trim();
  const orgId = (body.organization_id || "").trim();
  if (!policyId || !orgId)
    return NextResponse.json({ error: "policy_id and organization_id are required" }, { status: 400 });

  const db = createAdminClient();
  const { data: policy } = await db
    .from("policies")
    .select("id, account_id")
    .eq("id", policyId)
    .maybeSingle();
  const accountId = (policy?.account_id as string | null) ?? null;
  if (!accountId) return NextResponse.json({ error: "Not an account-level policy" }, { status: 400 });
  if (!(await isAccountAdmin(admin.user.id, accountId))) {
    return NextResponse.json({ error: "You do not administer this account" }, { status: 403 });
  }
  const valid = await workspaceIdsForAccount(db, accountId);
  if (!valid.has(orgId)) {
    return NextResponse.json({ error: "That workspace is not in this account" }, { status: 403 });
  }

  if (body.apply) {
    const { error } = await db
      .from("policy_workspaces")
      .insert({ policy_id: policyId, organization_id: orgId });
    if (error && error.code !== "23505") return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db
      .from("policy_workspaces")
      .delete()
      .eq("policy_id", policyId)
      .eq("organization_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/portfolio/policies  Body: { policy_id }
 * Removes an account-level policy (mappings cascade). Caller must administer the
 * policy's account.
 */
export async function DELETE(req: Request) {
  const admin = await currentAccountAdmin();
  if (!admin) return NextResponse.json({ error: "Account admin access required" }, { status: 403 });

  let body: { policy_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const policyId = (body.policy_id || "").trim();
  if (!policyId) return NextResponse.json({ error: "policy_id is required" }, { status: 400 });

  const db = createAdminClient();
  const { data: policy } = await db.from("policies").select("account_id").eq("id", policyId).maybeSingle();
  const accountId = (policy?.account_id as string | null) ?? null;
  if (!accountId) return NextResponse.json({ error: "Not an account-level policy" }, { status: 400 });
  if (!(await isAccountAdmin(admin.user.id, accountId))) {
    return NextResponse.json({ error: "You do not administer this account" }, { status: 403 });
  }
  const { error } = await db.from("policies").delete().eq("id", policyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
