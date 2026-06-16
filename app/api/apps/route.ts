import { NextResponse } from "next/server";
import { getUser, getCurrentOrgId } from "@/lib/auth";
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
