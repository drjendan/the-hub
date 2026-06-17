import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveProvider, generateText, type AIProvider } from "@/lib/ai";
import { getOrgProviderKey } from "@/lib/provider-keys";

export const runtime = "nodejs";

const MAX_INPUT = 12000;

/**
 * POST /api/agents/:id/run-text   Body: { input }
 * Generic text-in / text-out run for connector-less agents: feeds the user's
 * text to the agent's system prompt via the AI layer (tenant BYOK key first,
 * platform key fallback) and returns the output. Respects the governance gate
 * (published only) and persists the run to agent_runs.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { input?: unknown };
  try {
    body = await _req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return NextResponse.json({ error: "Enter some text to run the agent on." }, { status: 400 });
  if (input.length > MAX_INPUT) {
    return NextResponse.json({ error: `Input is too long (max ~${MAX_INPUT} characters).` }, { status: 400 });
  }

  const supabase = createClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, status, organization_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  // Governance gate — only published agents may run (same rule as the Gmail run).
  if (agent.status !== "published") {
    return NextResponse.json(
      { error: "This agent isn't published yet. It must be approved and published before it can run." },
      { status: 403 }
    );
  }

  const { data: ver } = await supabase
    .from("agent_versions")
    .select("system_prompt")
    .eq("agent_id", agent.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const systemPrompt = ver?.system_prompt || "You are a helpful assistant. Process the user's input.";

  // Credential: tenant BYO key first (bills to them), platform key as fallback.
  let provider: AIProvider;
  let apiKeyOverride: string | undefined;
  let modelOverride: string | undefined;
  const tenantKey = await getOrgProviderKey(agent.organization_id);
  if (tenantKey) {
    provider = tenantKey.provider;
    apiKeyOverride = tenantKey.apiKey;
    modelOverride = tenantKey.model ?? undefined;
  } else {
    const platform = resolveProvider();
    if (!platform) {
      return NextResponse.json(
        { error: "No AI provider configured. Add a key in Settings, or set a platform key." },
        { status: 503 }
      );
    }
    provider = platform;
  }

  let output: string;
  try {
    output = await generateText({
      provider,
      apiKey: apiKeyOverride,
      model: modelOverride,
      system: systemPrompt,
      user: input,
      temperature: 0.3,
      maxTokens: 1200,
    });
  } catch (err) {
    // Don't surface the provider's raw error body (it can echo a masked key).
    const code = (err as Error).message.match(/\b(\d{3})\b/)?.[1];
    return NextResponse.json(
      {
        error: code
          ? `The AI provider could not complete the run (HTTP ${code}).`
          : "The AI provider could not complete the run. Check the company's API key in Settings.",
      },
      { status: 502 }
    );
  }

  if (!output) output = "(The model returned no text.)";

  // Persist the run (best-effort — if agent_runs.sql hasn't been applied yet,
  // the run still succeeds; the insert simply no-ops on error).
  await supabase.from("agent_runs").insert({
    organization_id: agent.organization_id,
    agent_id: agent.id,
    user_id: user.id,
    kind: "text",
    input,
    output,
  });

  return NextResponse.json({ output });
}
