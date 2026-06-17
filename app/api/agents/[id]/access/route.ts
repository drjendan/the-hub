import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { getUser, ensureProfile, getOrgsForUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.filter((x): x is string => typeof x === "string")));
}

type AgentRow = { id: string; owner_id: string | null; organization_id: string; visibility: string | null };

/**
 * Authorize the caller to manage this agent's access: the agent's owner, a
 * global admin, or the company's owner. Returns the agent or an error response.
 */
async function authorize(
  supabase: ReturnType<typeof createClient>,
  agentId: string,
  user: User
): Promise<{ agent: AgentRow } | { error: NextResponse }> {
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, owner_id, organization_id, visibility")
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    return { error: NextResponse.json({ error: "Access control isn't enabled yet. Run supabase/agent_access.sql." }, { status: 400 }) };
  }
  if (!agent) return { error: NextResponse.json({ error: "Agent not found" }, { status: 404 }) };

  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const isOwner = agent.owner_id === user.id;
  const isAdmin = profile.app_role === "admin";
  const isOrgOwner = orgs.some((o) => o.id === agent.organization_id && o.org_role === "owner");
  if (!(isOwner || isAdmin || isOrgOwner)) {
    return { error: NextResponse.json({ error: "Only the agent's owner or a company admin can manage access." }, { status: 403 }) };
  }
  return { agent: agent as AgentRow };
}

/** GET → { visibility, assigned: [{id,name}] } */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createClient();
  const auth = await authorize(supabase, params.id, user);
  if ("error" in auth) return auth.error;

  const { data } = await supabase
    .from("agent_access")
    .select("user:profiles(id, full_name, email)")
    .eq("agent_id", params.id);
  const assigned = (data || [])
    .map((r) => {
      const u = r.user as unknown as { id: string; full_name: string | null; email: string | null } | null;
      return u ? { id: u.id, name: u.full_name || u.email || "Unknown" } : null;
    })
    .filter((m): m is { id: string; name: string } => m !== null);

  return NextResponse.json({ visibility: auth.agent.visibility ?? "everyone", assigned });
}

/**
 * PUT  Body: { visibility: 'everyone'|'restricted', user_ids: string[] }
 * Sets visibility and replaces the assigned list. Only org members may be
 * assigned (tenant isolation). Writes use the service role after the owner/admin
 * check above, so an org owner who isn't a builder can still manage access.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = createClient();
  const auth = await authorize(supabase, params.id, user);
  if ("error" in auth) return auth.error;
  const agent = auth.agent;

  let body: { visibility?: unknown; user_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const visibility = body.visibility === "restricted" ? "restricted" : "everyone";
  const requestedIds = asStringArray(body.user_ids);

  const db = createAdminClient();

  // Validate assigned users are members of THIS agent's company.
  let validIds: string[] = [];
  if (visibility === "restricted" && requestedIds.length) {
    const { data: members } = await db
      .from("org_members")
      .select("user_id")
      .eq("organization_id", agent.organization_id)
      .in("user_id", requestedIds);
    validIds = (members || []).map((m) => m.user_id as string);
  }

  const { error: upErr } = await db.from("agents").update({ visibility }).eq("id", agent.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Replace the assignment list.
  await db.from("agent_access").delete().eq("agent_id", agent.id);
  if (visibility === "restricted" && validIds.length) {
    await db.from("agent_access").insert(
      validIds.map((uid) => ({
        agent_id: agent.id,
        user_id: uid,
        organization_id: agent.organization_id,
        granted_by: user.id,
      }))
    );
  }

  return NextResponse.json({ ok: true, visibility, assigned_count: validIds.length });
}
