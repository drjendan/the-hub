import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveProvider, generateJSON } from "@/lib/ai";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { refreshAccessToken, listMessageIds, getMessageMeta } from "@/lib/google";

export const runtime = "nodejs";

const MAX_EMAILS = 6;

/**
 * POST /api/agents/:id/run
 * Runs the agent against the signed-in user's connected Gmail: pulls recent
 * inbox messages and classifies each as spam/not-spam using the agent's stored
 * system prompt + the configured AI provider. Read-only — nothing is modified
 * in Gmail (labeling comes with the gmail.modify upgrade later).
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();

  // Load the agent + its latest system prompt.
  const { data: agent } = await supabase
    .from("agents")
    .select("id, name")
    .eq("id", params.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

  const { data: ver } = await supabase
    .from("agent_versions")
    .select("system_prompt")
    .eq("agent_id", agent.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const systemPrompt = ver?.system_prompt || "You are a spam-detection assistant.";

  // The AI provider that will classify.
  const provider = resolveProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "No AI provider configured. Set an API key (e.g. GOOGLE_API_KEY)." },
      { status: 503 }
    );
  }

  // The user's Gmail connection.
  const { data: conn } = await supabase
    .from("connections")
    .select("*")
    .eq("provider", "google")
    .maybeSingle();
  if (!conn) {
    return NextResponse.json({ error: "Connect a Gmail account first.", needsConnect: true }, { status: 400 });
  }

  // Refresh the access token if it's expired (or about to be).
  let accessToken: string;
  try {
    accessToken = decryptSecret(conn.access_token);
    const expMs = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
    if (expMs < Date.now() + 60_000) {
      if (!conn.refresh_token) {
        return NextResponse.json(
          { error: "Gmail session expired. Please reconnect.", needsConnect: true },
          { status: 400 }
        );
      }
      const refreshed = await refreshAccessToken(decryptSecret(conn.refresh_token));
      accessToken = refreshed.access_token;
      await supabase
        .from("connections")
        .update({
          access_token: encryptSecret(accessToken),
          token_expires_at: new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString(),
        })
        .eq("id", conn.id);
    }
  } catch {
    return NextResponse.json(
      { error: "Could not access the Gmail connection. Please reconnect.", needsConnect: true },
      { status: 400 }
    );
  }

  // Pull recent inbox messages.
  let messages;
  try {
    const ids = await listMessageIds(accessToken, "in:inbox newer_than:14d", MAX_EMAILS);
    messages = await Promise.all(ids.map((id) => getMessageMeta(accessToken, id)));
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read Gmail: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  if (messages.length === 0) {
    return NextResponse.json({ account_email: conn.account_email, results: [] });
  }

  const system =
    systemPrompt +
    " You are deciding whether a single email is spam/junk/phishing. " +
    'Return ONLY JSON: {"spam": boolean, "reason": string (one short sentence)}.';

  const results = await Promise.all(
    messages.map(async (m) => {
      try {
        const out = await generateJSON<{ spam?: boolean; reason?: string }>({
          provider,
          system,
          user: JSON.stringify({ from: m.from, subject: m.subject, snippet: m.snippet }),
          temperature: 0,
          maxTokens: 200,
        });
        return { ...m, spam: Boolean(out.spam), reason: out.reason || "" };
      } catch {
        return { ...m, spam: null as boolean | null, reason: "classification failed" };
      }
    })
  );

  return NextResponse.json({ account_email: conn.account_email, results });
}
