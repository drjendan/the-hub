import { NextResponse } from "next/server";
import { getUser, ensureProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * PUT /api/runs/:id/feedback  Body: { verdict: 'accurate' | 'hallucinated' | 'clear' }
 * Records a reviewer's accuracy judgment on a persisted run. Only reviewers /
 * admins may rate (also enforced by the agent_runs UPDATE RLS policy).
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await ensureProfile(user);
  if (profile.app_role !== "admin" && profile.app_role !== "reviewer") {
    return NextResponse.json({ error: "Only reviewers or admins can rate runs." }, { status: 403 });
  }

  let body: { verdict?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const verdict = body.verdict;

  const patch: Record<string, unknown> = {
    rated_by: user.id,
    rated_at: new Date().toISOString(),
  };
  if (verdict === "accurate") {
    patch.accurate = true;
    patch.hallucinated = false;
  } else if (verdict === "hallucinated") {
    patch.accurate = false;
    patch.hallucinated = true;
  } else {
    // "clear" — reset the rating
    patch.accurate = null;
    patch.hallucinated = null;
    patch.rated_by = null;
    patch.rated_at = null;
  }

  const supabase = createClient();
  const { error } = await supabase.from("agent_runs").update(patch).eq("id", params.id);
  if (error) {
    return NextResponse.json(
      { error: error.code === "42P01" ? "Run history isn't enabled yet. Run supabase/agent_runs.sql." : error.message },
      { status: error.code === "42P01" ? 400 : 500 }
    );
  }
  return NextResponse.json({ ok: true, verdict });
}
