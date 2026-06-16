import { NextResponse } from "next/server";
import { getUser, getCurrentOrgId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sanitizeConnectors } from "@/lib/connectors";
import type { RiskTier } from "@/lib/supabase/types";

export const runtime = "nodejs";

const RISKS: RiskTier[] = ["low", "moderate", "high", "restricted"];

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "agent"
  );
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean);
}

/**
 * POST /api/agents
 * Persists a new agent for the caller's current organization. The agent is
 * tagged with owner_id (creator) and organization_id (tenant). High/restricted
 * risk agents enter "in_review" and open a governance request; lower risk
 * publishes directly. A v1 version snapshot is written alongside.
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
  if (!name) return NextResponse.json({ error: "Agent name is required" }, { status: 400 });

  const risk: RiskTier = RISKS.includes(body.risk as RiskTier) ? (body.risk as RiskTier) : "low";
  const requiresReview = risk === "high" || risk === "restricted";
  const status = requiresReview ? "in_review" : "published";

  const summary = body.summary ? String(body.summary) : null;
  const category = body.category ? String(body.category) : null;
  const systemPrompt = body.system_prompt ? String(body.system_prompt) : null;
  const model = body.model ? String(body.model) : "gpt-4o-mini";
  const temperature = typeof body.temperature === "number" ? body.temperature : 0.3;
  const connectors = sanitizeConnectors(body.connectors);
  const capabilities = asStringArray(body.capabilities);
  const tags = asStringArray(body.tags);

  const supabase = createClient();
  const base = slugify(name);

  // Insert the agent with a per-org unique slug, retrying on collision.
  let agent: { id: string; slug: string } | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 5 && !agent; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await supabase
      .from("agents")
      .insert({
        organization_id: orgId,
        slug,
        name,
        summary,
        category,
        status,
        risk,
        owner_id: user.id,
        current_version: 1,
        tags,
        capabilities,
        tools: [],
        connectors,
      })
      .select("id, slug")
      .single();

    if (!error) {
      agent = data;
      break;
    }
    lastError = error.message;
    if (error.code !== "23505") {
      // 42501 = RLS denial (not a builder/admin or not a member).
      const msg =
        error.code === "42501"
          ? "You don't have permission to create agents in this company."
          : error.message;
      return NextResponse.json({ error: msg }, { status: error.code === "42501" ? 403 : 500 });
    }
  }

  if (!agent) {
    return NextResponse.json(
      { error: `Could not save agent. ${lastError}` },
      { status: 500 }
    );
  }

  // v1 version snapshot.
  await supabase.from("agent_versions").insert({
    agent_id: agent.id,
    organization_id: orgId,
    version: 1,
    status,
    system_prompt: systemPrompt,
    model,
    temperature,
    config: { connectors },
    changelog: "Initial version",
    created_by: user.id,
  });

  // High/restricted risk → governance queue.
  if (requiresReview) {
    await supabase.from("governance_requests").insert({
      organization_id: orgId,
      agent_id: agent.id,
      kind: "publish",
      status: "open",
      title: `Publish ${name} v1`,
      detail: `${risk} risk agent submitted for review before publishing.`,
      risk,
      requested_by: user.id,
    });
  }

  return NextResponse.json({ id: agent.id, slug: agent.slug, status });
}
