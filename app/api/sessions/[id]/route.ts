import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * POST /api/sessions/:id  Body: { action: "revoke" }
 * Revokes a runtime session. RLS restricts writes to the session owner.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.action !== "revoke") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("sessions")
    .update({ status: "revoked", revoked_reason: "Revoked by user", closed_at: new Date().toISOString() })
    .eq("id", params.id);
  if (error) {
    const msg = error.code === "42501" ? "You can only revoke your own sessions." : error.message;
    return NextResponse.json({ error: msg }, { status: error.code === "42501" ? 403 : 500 });
  }
  return NextResponse.json({ ok: true });
}
