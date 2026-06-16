import { NextResponse } from "next/server";
import { getUser, getCurrentOrgId, ensureProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function isHttpUrl(u: string): boolean {
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "You are not part of a company yet. Ask your admin to add you." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
  // product_owner is a profile id; default to the creator if none chosen.
  const productOwner =
    typeof body.product_owner === "string" && body.product_owner ? body.product_owner : user.id;

  const supabase = createClient();

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

  return NextResponse.json({ id: app.id, status: app.status });
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
