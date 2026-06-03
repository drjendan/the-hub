import { NextResponse } from "next/server";
import { resolveProvider, generateJSON, listProviders } from "@/lib/ai";

export const runtime = "nodejs";

/**
 * GET  /api/suggest-agent  -> { providers: ProviderInfo[], active: provider|null }
 *   Lets the UI show which AI providers are wired up.
 *
 * POST /api/suggest-agent
 * Body: { name?: string, role?: string, goal?: string, provider?: string }
 *   -> { suggestion: AgentSuggestion, source: provider | "none" }
 *
 * Drafts a complete agent configuration (summary, capabilities, suggested
 * system prompt, tools, category, and a recommended risk tier) from a short
 * prompt. This is the "connect to ChatGPT / Claude / Gemini for suggestions"
 * feature used by the Builder. No user history is sent — only the fields below.
 */

export interface AgentSuggestion {
  name: string;
  summary: string;
  category: string;
  capabilities: string[];
  tools: string[];
  system_prompt: string;
  risk: "low" | "moderate" | "high" | "restricted";
  risk_rationale: string;
}

export async function GET() {
  return NextResponse.json({
    providers: listProviders(),
    active: resolveProvider(),
  });
}

export async function POST(req: Request) {
  let body: { name?: string; role?: string; goal?: string; provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const seed = [body.name, body.role, body.goal].filter(Boolean).join(" — ").trim();
  if (!seed) {
    return NextResponse.json(
      { error: "Provide at least one of: name, role, goal" },
      { status: 400 }
    );
  }

  const provider = resolveProvider(body.provider);
  if (!provider) {
    return NextResponse.json(
      {
        error:
          "No AI provider is configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY.",
        source: "none",
      },
      { status: 503 }
    );
  }

  const system =
    "You are an expert at designing enterprise AI agents that act as digital employees. " +
    "Given a short brief, draft ONE agent configuration. Return ONLY a JSON object with keys: " +
    "name (string), summary (one sentence), category (string e.g. Finance, Support, HR, Sales, Research, Operations), " +
    "capabilities (array of 3-6 short strings), tools (array of 2-5 likely integrations), " +
    "system_prompt (a concise, production-ready system prompt of 2-4 sentences), " +
    'risk (one of "low","moderate","high","restricted"), risk_rationale (one sentence). ' +
    "Assign higher risk when the agent touches money movement, PII, hiring decisions, or external comms.";

  try {
    const suggestion = await generateJSON<AgentSuggestion>({
      provider,
      system,
      user: JSON.stringify({ brief: seed }),
      temperature: 0.4,
      maxTokens: 1100,
    });
    return NextResponse.json({ suggestion, source: provider });
  } catch (err) {
    console.error("suggest-agent failed:", err);
    return NextResponse.json(
      { error: "The AI provider call failed. Check the API key and try again.", source: "none" },
      { status: 502 }
    );
  }
}
