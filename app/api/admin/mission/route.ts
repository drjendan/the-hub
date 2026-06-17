import { NextResponse } from "next/server";
import { getUser, ensureProfile, getOrgsForUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX = 2000;

/** Only a global admin or an OWNER of the target company may edit its mission. */
async function authorize(orgId: string): Promise<{ ok: true } | { error: NextResponse }> {
  const user = await getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const profile = await ensureProfile(user);
  let allowed = profile.app_role === "admin";
  if (!allowed) {
    const orgs = await getOrgsForUser();
    allowed = orgs.some((o) => o.id === orgId && o.org_role === "owner");
  }
  if (!allowed) {
    return { error: NextResponse.json({ error: "Only a global admin or an owner of this company can edit its mission." }, { status: 403 }) };
  }
  return { ok: true };
}

/** PUT  Body: { org_id, mission } — set (or clear, with empty) the mission statement. */
export async function PUT(req: Request) {
  let body: { org_id?: unknown; mission?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const orgId = typeof body.org_id === "string" ? body.org_id : "";
  if (!orgId) return NextResponse.json({ error: "org_id is required" }, { status: 400 });

  const auth = await authorize(orgId);
  if ("error" in auth) return auth.error;

  let mission = typeof body.mission === "string" ? body.mission.trim() : "";
  if (mission.length > MAX) mission = mission.slice(0, MAX);

  const db = createAdminClient();
  const { error } = await db
    .from("organizations")
    .update({ mission_statement: mission || null })
    .eq("id", orgId);
  if (error) {
    return NextResponse.json(
      { error: `${error.message} — has supabase/mission.sql been run?` },
      { status: 500 }
    );
  }
  return NextResponse.json({ mission_statement: mission || null });
}
