import { NextResponse } from "next/server";
import { currentSuperAdmin } from "@/lib/auth";
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
 * POST /api/platform/orgs  Body: { name, industry?, size_band?, owner_email? }
 *
 * Creates a tenant from the platform super-admin portal. PLATFORM-SUPER-ADMIN
 * ONLY — gated by currentSuperAdmin() before the service-role client is ever
 * constructed. Unlike /api/admin/orgs, the super-admin is NOT added as a member
 * of the new tenant (the portal sees every tenant via the service role, so the
 * platform owner stays out of tenant member lists — cleaner isolation).
 *
 * If owner_email is provided, that user is seeded as the tenant's first OWNER
 * (existing profile → assigned directly; otherwise invited by email). Blank
 * owner_email creates an empty tenant (e.g. a demo tenant).
 */
export async function POST(req: Request) {
  const su = await currentSuperAdmin();
  if (!su) return NextResponse.json({ error: "Platform super-admin access required" }, { status: 403 });

  let body: { name?: string; industry?: string; size_band?: string; owner_email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Company name is required" }, { status: 400 });

  const ownerEmail = (body.owner_email || "").trim().toLowerCase();
  if (ownerEmail && !ownerEmail.includes("@")) {
    return NextResponse.json({ error: "Owner email is not a valid address" }, { status: 400 });
  }

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
        governance_mode: "standard",
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

  // Optionally seed the first owner.
  let ownerStatus: "assigned" | "invited" | null = null;
  if (ownerEmail) {
    let userId: string | null = null;

    const { data: existing } = await db
      .from("profiles")
      .select("id")
      .eq("email", ownerEmail)
      .maybeSingle();

    if (existing) {
      userId = existing.id;
      ownerStatus = "assigned";
    } else {
      const { data: invite, error: inviteErr } = await db.auth.admin.inviteUserByEmail(ownerEmail);
      if (inviteErr || !invite?.user) {
        // The tenant was created; report the owner-seed failure without rolling back.
        return NextResponse.json(
          {
            org,
            owner_error:
              "Tenant created, but the owner could not be invited. Ensure email sending is configured in Supabase Auth, or add the owner later. " +
              (inviteErr?.message ?? ""),
          },
          { status: 207 }
        );
      }
      userId = invite.user.id;
      ownerStatus = "invited";
    }

    // Promote a brand-new/member profile to 'builder' and default them into this
    // org (mirrors /api/admin/members; the DB guard allows it from service role).
    const { data: prof } = await db
      .from("profiles")
      .select("id, app_role, default_org_id")
      .eq("id", userId!)
      .maybeSingle();
    const patch: Record<string, unknown> = {};
    if (!prof || prof.app_role === "member") patch.app_role = "builder";
    if (prof && !prof.default_org_id) patch.default_org_id = org.id;
    if (Object.keys(patch).length > 0) {
      await db.from("profiles").update(patch).eq("id", userId!);
    }

    const { error: memberErr } = await db
      .from("org_members")
      .insert({ organization_id: org.id, user_id: userId!, org_role: "owner" });
    if (memberErr && memberErr.code !== "23505") {
      return NextResponse.json({ org, owner_error: memberErr.message }, { status: 207 });
    }
  }

  return NextResponse.json({ org, owner_status: ownerStatus });
}
