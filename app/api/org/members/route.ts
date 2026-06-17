import { NextResponse } from "next/server";
import { getUser, getCurrentOrgId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/org/members → members of the caller's active company (id + name). */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getCurrentOrgId();
  if (!orgId) return NextResponse.json({ members: [] });

  const supabase = createClient();
  const { data } = await supabase
    .from("org_members")
    .select("user:profiles(id, full_name, email)")
    .eq("organization_id", orgId);

  const members = (data || [])
    .map((m) => {
      const u = m.user as unknown as { id: string; full_name: string | null; email: string | null } | null;
      return u ? { id: u.id, name: u.full_name || u.email || "Unknown" } : null;
    })
    .filter((m): m is { id: string; name: string } => m !== null);

  return NextResponse.json({ members });
}
