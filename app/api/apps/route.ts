import { NextResponse } from "next/server";
import { getUser, getCurrentOrgId, getOrgsForUser, ensureProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** The richer profile fields from a request body (best-effort columns). */
function profilePatch(body: Record<string, unknown>) {
  return {
    primary_users: typeof body.primary_users === "string" ? body.primary_users : null,
    key_features: typeof body.key_features === "string" ? body.key_features : null,
    data_inputs: typeof body.data_inputs === "string" ? body.data_inputs : null,
    status_label: typeof body.status_label === "string" ? body.status_label : null,
  };
}

/**
 * POST /api/apps
 * Registers a launchable app (a governed link to an existing tool) for the
 * caller's current organization. Mirrors agent creation: the app starts
 * "in_review" and opens a governance request (kind 'publish') into the SAME
 * queue agents use; it only becomes launchable once a reviewer approves it.
 * No prompt, no AI, no run logic — just a URL.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Resolve the target company: an explicit organization_id the caller is a
  // member of (enforces the tenant boundary), else the active workspace.
  const orgs = await getOrgsForUser();
  const requestedOrg = typeof body.organization_id === "string" ? body.organization_id : "";
  let orgId: string | null;
  if (requestedOrg) {
    if (!orgs.some((o) => o.id === requestedOrg)) {
      return NextResponse.json({ error: "You are not a member of the selected company." }, { status: 403 });
    }
    orgId = requestedOrg;
  } else {
    orgId = await getCurrentOrgId(orgs);
  }
  if (!orgId) {
    return NextResponse.json(
      { error: "You are not part of a company yet. Ask your admin to add you." },
      { status: 400 }
    );
  }

  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "App name is required" }, { status: 400 });

  const url = String(body.url || "").trim();
  if (!url) return NextResponse.json({ error: "A launch URL is required" }, { status: 400 });
  if (!isHttpUrl(url)) {
    return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
  }

  const description = body.description ? String(body.description) : null;
  const category = body.category ? String(body.category) : null;

  const supabase = createClient();

  // product_owner is a profile id; default to the creator, and ensure any chosen
  // owner is actually a member of the target company (keeps attribution clean).
  let productOwner =
    typeof body.product_owner === "string" && body.product_owner ? body.product_owner : user.id;
  if (productOwner !== user.id) {
    const { data: pm } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("organization_id", orgId)
      .eq("user_id", productOwner)
      .maybeSingle();
    if (!pm) productOwner = user.id;
  }

  const { data: app, error } = await supabase
    .from("apps")
    .insert({
      organization_id: orgId,
      name,
      url,
      description,
      category,
      status: "in_review",
      product_owner: productOwner,
      created_by: user.id,
    })
    .select("id, status")
    .single();

  if (error) {
    // 42501 = RLS denial (not a builder/admin or not a member).
    const msg =
      error.code === "42501"
        ? "You don't have permission to register apps in this company."
        : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === "42501" ? 403 : 500 });
  }

  // Submit into the SAME governance queue agents use (kind 'publish').
  await supabase.from("governance_requests").insert({
    organization_id: orgId,
    app_id: app.id,
    kind: "publish",
    status: "open",
    title: `Publish app: ${name}`,
    detail: `New app awaiting review before it can be launched. URL: ${url}`,
    risk: "low",
    requested_by: user.id,
  });

  // Richer profile fields — best-effort (no-op if apps_profile.sql isn't applied).
  await supabase.from("apps").update(profilePatch(body)).eq("id", app.id);

  return NextResponse.json({ id: app.id, status: app.status });
}

/**
 * PUT /api/apps  Body: { id, name?, url?, description?, category?, product_owner?,
 *   primary_users?, key_features?, data_inputs?, status_label? }
 * Updates an app's profile (additive metadata). Does NOT change governance status
 * or launchability. Permission: member of the app's company AND (admin/builder OR
 * the product owner) — same as delete. Writes use the service role after the
 * check, so a non-builder product owner can still edit their app.
 */
export async function PUT(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "App id is required" }, { status: 400 });

  const supabase = createClient();
  // RLS read confirms the caller is a member of the app's company.
  const { data: app } = await supabase
    .from("apps")
    .select("id, product_owner, organization_id")
    .eq("id", id)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "App not found in your company." }, { status: 404 });

  const profile = await ensureProfile(user);
  const allowed =
    profile.app_role === "admin" || profile.app_role === "builder" || app.product_owner === user.id;
  if (!allowed) {
    return NextResponse.json(
      { error: "Only an admin/builder of this company or the product owner can edit this app." },
      { status: 403 }
    );
  }

  const core: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) core.name = body.name.trim();
  if (typeof body.url === "string") {
    const u = body.url.trim();
    if (u && !isHttpUrl(u)) return NextResponse.json({ error: "URL must start with http:// or https://" }, { status: 400 });
    core.url = u;
  }
  if ("description" in body) core.description = typeof body.description === "string" ? body.description : null;
  if ("category" in body) core.category = typeof body.category === "string" && body.category.trim() ? body.category.trim() : null;
  // product_owner change — validate membership of the app's company.
  if (typeof body.product_owner === "string" && body.product_owner && body.product_owner !== app.product_owner) {
    const { data: pm } = await supabase
      .from("org_members")
      .select("user_id")
      .eq("organization_id", app.organization_id)
      .eq("user_id", body.product_owner)
      .maybeSingle();
    if (pm) core.product_owner = body.product_owner;
  }

  const db = createAdminClient();
  if (Object.keys(core).length > 0) {
    const { error } = await db.from("apps").update(core).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Richer profile fields — best-effort (no-op if apps_profile.sql isn't applied).
  await db.from("apps").update(profilePatch(body)).eq("id", id);

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/apps  Body: { id }
 * Hard-deletes an app. Permission (enforced here AND by RLS): the caller must be
 * a member of the app's company AND (an admin/builder OR the app's product owner).
 * Related governance_requests are removed automatically by the app_id FK cascade.
 */
export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { id?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "App id is required" }, { status: 400 });

  const supabase = createClient();

  // RLS read: a member can see the row. If not visible, it's not in your company.
  const { data: app } = await supabase
    .from("apps")
    .select("id, product_owner")
    .eq("id", id)
    .maybeSingle();
  if (!app) return NextResponse.json({ error: "App not found in your company." }, { status: 404 });

  const profile = await ensureProfile(user);
  const allowed =
    profile.app_role === "admin" ||
    profile.app_role === "builder" ||
    app.product_owner === user.id;
  if (!allowed) {
    return NextResponse.json(
      { error: "Only an admin/builder of this company or the product owner can delete this app." },
      { status: 403 }
    );
  }

  const { data: deleted, error } = await supabase.from("apps").delete().eq("id", id).select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!deleted || deleted.length === 0) {
    // RLS blocked it (e.g. owner-delete without the optional deletes.sql policy).
    return NextResponse.json(
      { error: "Delete was blocked by policy. An admin/builder can delete it, or run supabase/deletes.sql to allow owner deletes." },
      { status: 403 }
    );
  }
  return NextResponse.json({ ok: true });
}
