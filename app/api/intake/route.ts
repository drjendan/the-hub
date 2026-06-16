import { NextResponse } from "next/server";
import { getUser, getCurrentOrgId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/intake
 * Records a corporate/role intake submission for the caller's current company.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const orgId = await getCurrentOrgId();
  if (!orgId) {
    return NextResponse.json(
      { error: "Join or select a company before submitting intake." },
      { status: 400 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const intakeType = body.intake_type === "role" ? "role" : "corporate";
  const supabase = createClient();
  const { error } = await supabase.from("intake_submissions").insert({
    organization_id: orgId,
    intake_type: intakeType,
    submitted_by: user.id,
    payload: body,
    status: "received",
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
