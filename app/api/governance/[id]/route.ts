import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DECISIONS = ["approved", "rejected", "changes_requested"] as const;
type Decision = (typeof DECISIONS)[number];

/**
 * POST /api/governance/:id  Body: { decision, note? }
 * Records a reviewer decision: writes an approval row, updates the request, and
 * (for publish requests) flips the agent to published/blocked. RLS requires the
 * caller to be a reviewer or admin in the org.
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { decision?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const decision = body.decision as Decision;
  if (!DECISIONS.includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const supabase = createClient();

  const { data: request } = await supabase
    .from("governance_requests")
    .select("id, organization_id, agent_id, kind, status")
    .eq("id", params.id)
    .maybeSingle();
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // Record the approval decision (RLS enforces reviewer/admin).
  const { error: approvalErr } = await supabase.from("approvals").insert({
    request_id: request.id,
    organization_id: request.organization_id,
    reviewer_id: user.id,
    decision,
    note: body.note || null,
  });
  if (approvalErr) {
    const msg =
      approvalErr.code === "42501"
        ? "Only reviewers or admins can decide governance requests."
        : approvalErr.message;
    return NextResponse.json({ error: msg }, { status: approvalErr.code === "42501" ? 403 : 500 });
  }

  // Update the request.
  const resolved = decision === "approved" || decision === "rejected";
  const { error: updErr } = await supabase
    .from("governance_requests")
    .update({
      status: decision,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", request.id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Reflect a publish decision on the agent itself.
  if (request.kind === "publish" && request.agent_id) {
    if (decision === "approved") {
      await supabase.from("agents").update({ status: "published" }).eq("id", request.agent_id);
    } else if (decision === "rejected") {
      await supabase.from("agents").update({ status: "blocked" }).eq("id", request.agent_id);
    }
  }

  return NextResponse.json({ ok: true });
}
