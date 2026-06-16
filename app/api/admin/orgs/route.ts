import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "company"
  );
}

/**
 * POST /api/admin/orgs  Body: { name, industry?, size_band?, governance_mode? }
 * Creates a company (tenant) and adds the creating admin as its owner member,
 * so the provider can see and manage every tenant via RLS. Service-role only.
 */
export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let body: { name?: string; industry?: string; size_band?: string; governance_mode?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Company name is required" }, { status: 400 });

  const db = createAdminClient();
  const base = slugify(name);

  // Insert with a unique slug, retrying on collision.
  let org: { id: string; name: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !org; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await db
      .from("organizations")
      .insert({
        name,
        slug,
        industry: body.industry || null,
        size_band: body.size_band || null,
        governance_mode: body.governance_mode || "standard",
      })
      .select("id, name, slug")
      .single();

    if (!error) {
      org = data;
      break;
    }
    if (error.code !== "23505") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  if (!org) {
    return NextResponse.json({ error: "Could not generate a unique slug" }, { status: 409 });
  }

  // Add the provider/admin as the owner member of the new tenant.
  const { error: memberErr } = await db.from("org_members").insert({
    organization_id: org.id,
    user_id: admin.user.id,
    org_role: "owner",
  });
  if (memberErr && memberErr.code !== "23505") {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  return NextResponse.json({ org });
}
