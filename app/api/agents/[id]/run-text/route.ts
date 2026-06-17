import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveProvider, generateText, type AIProvider } from "@/lib/ai";
import { getOrgProviderKey } from "@/lib/provider-keys";
import { embedQuery } from "@/lib/embeddings";

export const runtime = "nodejs";

const MAX_FILE_BYTES = 4 * 1024 * 1024; // 4 MB — under Vercel's ~4.5MB body cap
const MAX_TEXT = 20000; // chars actually sent to the model

// Self-reported confidence — appended to the prompt, parsed back out, stripped
// from the shown answer. Weakly calibrated (a model rating itself), surfaced as a
// soft signal + review trigger, not ground truth.
const CONFIDENCE_INSTRUCTION =
  '\n\nAfter your response, on a final line by itself, write "CONFIDENCE: N" where N ' +
  "is an integer from 0 to 100 indicating how confident you are that your answer is " +
  "accurate and grounded in any provided context.";

type Source = "pasted" | "txt" | "pdf";

/** Read text out of an uploaded file (.txt/.md decoded; .pdf extracted via unpdf). */
async function extractFromFile(file: File): Promise<{ text: string; source: Source } | { error: string }> {
  if (file.size > MAX_FILE_BYTES) return { error: "File is too large (max 4 MB)." };

  const name = file.name.toLowerCase();
  const type = file.type;

  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    return { text: await file.text(), source: "txt" };
  }

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    try {
      // Lazy import so pdf.js only loads when a PDF is actually uploaded.
      const { extractText, getDocumentProxy } = await import("unpdf");
      const buf = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      // mergePages joins all pages into one string.
      const { text } = await extractText(pdf, { mergePages: true });
      return { text, source: "pdf" };
    } catch (err) {
      return { error: `Could not read the PDF: ${(err as Error).message}` };
    }
  }

  return { error: "Unsupported file type. Upload a .txt, .md, or PDF file." };
}

/**
 * POST /api/agents/:id/run-text   (multipart form: `input` text and/or `file`)
 * Generic run for connector-less agents. Accepts pasted text OR an uploaded
 * .txt/.md/PDF (text extracted server-side), feeds it to the agent's system
 * prompt via the AI layer (tenant BYOK key first, platform fallback), persists
 * the run, and returns the output. Governance-gated (published agents only).
 */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected form data." }, { status: 400 });
  }

  const file = form.get("file");
  const pasted = typeof form.get("input") === "string" ? (form.get("input") as string).trim() : "";

  let inputText = "";
  let source: Source = "pasted";
  let fileName = "";
  if (file instanceof File && file.size > 0) {
    const res = await extractFromFile(file);
    if ("error" in res) return NextResponse.json({ error: res.error }, { status: 400 });
    inputText = res.text.trim();
    source = res.source;
    fileName = file.name;
    if (!inputText) {
      return NextResponse.json({ error: "No readable text found in that file." }, { status: 400 });
    }
  } else {
    inputText = pasted;
  }

  if (!inputText) {
    return NextResponse.json({ error: "Enter text or upload a file to run the agent on." }, { status: 400 });
  }

  let truncated = false;
  if (inputText.length > MAX_TEXT) {
    inputText = inputText.slice(0, MAX_TEXT);
    truncated = true;
  }

  const supabase = createClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, status, organization_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

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

  // RAG grounding (best-effort): retrieve relevant governance-knowledge chunks
  // for this org and inject them as context. Silently skipped if RAG isn't set
  // up, there's no OpenAI key, or nothing has been indexed.
  let groundedSystem = systemPrompt;
  let groundingSources: string[] = [];
  try {
    const qvec = await embedQuery(agent.organization_id, inputText);
    if (qvec) {
      const { data: matches } = await supabase.rpc("match_knowledge", {
        query_embedding: JSON.stringify(qvec),
        org: agent.organization_id,
        match_count: 5,
      });
      const relevant = ((matches as { content: string; source_title: string; similarity: number }[] | null) || [])
        .filter((m) => m.similarity > 0.2);
      if (relevant.length) {
        const ctx = relevant.map((m) => `- [${m.source_title}] ${m.content}`).join("\n");
        groundedSystem =
          `${systemPrompt}\n\nRelevant context from the company's governance knowledge base. ` +
          `Ground your answer in this where applicable, and cite the source title in [brackets] when you use it:\n${ctx}`;
        groundingSources = Array.from(new Set(relevant.map((m) => m.source_title)));
      }
    }
  } catch {
    // RAG is optional — never block a run on retrieval problems.
  }

  let output: string;
  try {
    output = await generateText({
      provider,
      apiKey: apiKeyOverride,
      model: modelOverride,
      system: groundedSystem + CONFIDENCE_INSTRUCTION,
      user: inputText,
      temperature: 0.3,
      maxTokens: 1500,
    });
  } catch (err) {
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

  // Parse + strip the self-reported confidence line.
  let confidence: number | null = null;
  const cm = output.match(/CONFIDENCE:\s*(\d{1,3})/i);
  if (cm) {
    confidence = Math.max(0, Math.min(1, parseInt(cm[1], 10) / 100));
    output = output.replace(/\n*\s*CONFIDENCE:\s*\d{1,3}[.\s]*$/i, "").trim();
  }
  if (!output) output = "(The model returned no text.)";

  // Persist (best-effort — runs still work before agent_runs.sql is applied).
  const label = source === "pasted" ? "pasted text" : `${fileName} (${source})`;
  const { data: runRow } = await supabase
    .from("agent_runs")
    .insert({
      organization_id: agent.organization_id,
      agent_id: agent.id,
      user_id: user.id,
      kind: "text",
      source,
      input: `${label}${truncated ? " · truncated" : ""}\n${inputText.slice(0, 500)}`,
      output,
      confidence,
      citations: groundingSources.length ? groundingSources : null,
    })
    .select("id")
    .single();

  return NextResponse.json({
    output,
    source,
    truncated,
    sources: groundingSources,
    confidence,
    run_id: runRow?.id ?? null,
  });
}
