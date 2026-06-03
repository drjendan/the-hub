import { NextResponse } from "next/server";
import { AGENTS } from "@/lib/demo-data";
import { resolveProvider, generateJSON } from "@/lib/ai";
import type { AgentMatch, RoleProfileInput } from "@/lib/supabase/types";

export const runtime = "nodejs";

/**
 * POST /api/recommendations
 * Body: RoleProfileInput (+ optional { provider })
 *   -> { matches: AgentMatch[], source: "openai" | "anthropic" | "google" | "heuristic" }
 *
 * Uses whichever AI provider is configured (ChatGPT / Claude / Gemini) via the
 * shared lib/ai layer. Sends only the role profile and a compact catalog — no
 * session transcripts or user history. Falls back to a transparent local
 * heuristic when no API key is present or the call fails.
 */
export async function POST(req: Request) {
  let body: RoleProfileInput & { provider?: string };
  try {
    body = (await req.json()) as RoleProfileInput & { provider?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const catalog = AGENTS.filter(
    (a) => a.status === "published" || a.status === "in_review"
  ).map((a) => ({
    agent_id: a.id,
    agent_name: a.name,
    category: a.category,
    summary: a.summary,
    capabilities: a.capabilities,
    tools: a.tools,
  }));

  const provider = resolveProvider(body.provider);
  if (provider) {
    try {
      const system =
        "You are an enterprise agent-matching engine. Given a role profile and a catalog " +
        "of available AI agents, rank the agents by fit for the role. Return ONLY JSON: " +
        '{"matches":[{"agent_id":string,"agent_name":string,"match_score":number(0..1),"rationale":string}]}. ' +
        "Include only agents with a plausible fit (score >= 0.4), highest first, max 4. " +
        "Keep each rationale to one concise sentence.";
      const user = JSON.stringify({ role: body, catalog });

      const parsed = await generateJSON<{ matches?: AgentMatch[] }>({
        provider,
        system,
        user,
        temperature: 0.2,
      });
      const matches = (Array.isArray(parsed.matches) ? parsed.matches : [])
        .filter((m) => typeof m.match_score === "number")
        .sort((a, b) => b.match_score - a.match_score)
        .slice(0, 4);
      return NextResponse.json({ matches, source: provider });
    } catch (err) {
      console.error("AI ranking failed, using heuristic:", err);
    }
  }

  return NextResponse.json({ matches: heuristicRank(body, catalog), source: "heuristic" });
}

// --------------------------------------------------------------------
// Heuristic fallback — transparent keyword/tool overlap scoring
// --------------------------------------------------------------------
function heuristicRank(
  role: RoleProfileInput,
  catalog: Array<Record<string, any>>
): AgentMatch[] {
  const roleTerms = new Set(
    [role.title, role.department ?? "", ...(role.responsibilities || []), ...(role.tools || [])]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2)
  );
  const roleTools = new Set((role.tools || []).map((t) => t.toLowerCase()));

  const scored = catalog.map((a) => {
    const text = [a.summary, ...(a.capabilities || []), a.category]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    const overlap = text.filter((w) => roleTerms.has(w)).length;
    const toolHit = (a.tools || []).filter((t: string) => roleTools.has(t.toLowerCase())).length;

    const raw = overlap * 0.12 + toolHit * 0.25;
    const score = Math.max(0, Math.min(1, raw));
    const reasons: string[] = [];
    if (overlap) reasons.push(`${overlap} responsibility keyword${overlap > 1 ? "s" : ""} overlap`);
    if (toolHit) reasons.push(`shares ${toolHit} tool${toolHit > 1 ? "s" : ""}`);
    const rationale = reasons.length
      ? `Matches because it ${reasons.join(" and ")}.`
      : "Partial category alignment with the role.";

    return {
      agent_id: a.agent_id as string,
      agent_name: a.agent_name as string,
      match_score: Number(score.toFixed(3)),
      rationale,
    };
  });

  return scored
    .filter((m) => m.match_score >= 0.2)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 4);
}
