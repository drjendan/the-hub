/**
 * Provider-agnostic AI layer.
 *
 * Supports three providers behind one interface: OpenAI (ChatGPT), Anthropic
 * (Claude), and Google (Gemini). The active provider is chosen by the
 * AI_PROVIDER env var, falling back to whichever API key is present.
 *
 * IMPORTANT — these are *API* keys, billed pay-as-you-go, NOT consumer
 * subscriptions (ChatGPT Plus / Claude Max / Gemini app do not provide them):
 *   - OpenAI    -> https://platform.openai.com/api-keys
 *   - Anthropic -> https://console.anthropic.com  (Settings -> API Keys)
 *   - Google    -> https://aistudio.google.com/app/apikey
 *
 * PRIVACY / DATA CONTROLS
 *   - We send only task inputs (role profiles, agent drafts, compact catalog
 *     summaries) — never session transcripts or end-user history.
 *   - OpenAI requests set `store: false` to opt out of server-side retention;
 *     API data is not used for training unless an org opts in.
 *     https://platform.openai.com/docs/guides/your-data
 *   - Anthropic does not train on API inputs/outputs by default.
 *     https://www.anthropic.com/legal/commercial-terms
 *   - Google AI API data handling: https://ai.google.dev/gemini-api/terms
 */

export type AIProvider = "openai" | "anthropic" | "google";

export interface ProviderInfo {
  provider: AIProvider;
  label: string;
  model: string;
  configured: boolean;
}

const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  google: "gemini-1.5-flash",
};

const LABELS: Record<AIProvider, string> = {
  openai: "ChatGPT (OpenAI)",
  anthropic: "Claude (Anthropic)",
  google: "Gemini (Google)",
};

function keyFor(provider: AIProvider): string | undefined {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_API_KEY;
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY;
    case "google":
      return process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  }
}

function modelFor(provider: AIProvider): string {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_MODEL || DEFAULT_MODELS.openai;
    case "anthropic":
      return process.env.ANTHROPIC_MODEL || DEFAULT_MODELS.anthropic;
    case "google":
      return process.env.GOOGLE_MODEL || DEFAULT_MODELS.google;
  }
}

/** Which providers have a usable API key in this environment. */
export function listProviders(): ProviderInfo[] {
  return (["openai", "anthropic", "google"] as AIProvider[]).map((p) => ({
    provider: p,
    label: LABELS[p],
    model: modelFor(p),
    configured: Boolean(keyFor(p)),
  }));
}

/**
 * Resolve the provider to use. Honors AI_PROVIDER when that provider has a key;
 * otherwise picks the first configured provider. Returns null if none are
 * configured (callers should then fall back to a local heuristic).
 */
export function resolveProvider(preferred?: string): AIProvider | null {
  const order: AIProvider[] = ["openai", "anthropic", "google"];
  const want = (preferred || process.env.AI_PROVIDER || "").toLowerCase();
  if (order.includes(want as AIProvider) && keyFor(want as AIProvider)) {
    return want as AIProvider;
  }
  return order.find((p) => keyFor(p)) ?? null;
}

export interface GenerateJSONArgs {
  provider: AIProvider;
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Call the chosen provider and return parsed JSON. Each provider is instructed
 * to emit a single JSON object; we strip any stray code fences before parsing.
 * Throws on transport/parse failure so callers can fall back gracefully.
 */
export async function generateJSON<T = unknown>(args: GenerateJSONArgs): Promise<T> {
  const { provider } = args;
  const apiKey = keyFor(provider);
  if (!apiKey) throw new Error(`No API key configured for provider "${provider}"`);

  let raw: string;
  if (provider === "openai") raw = await callOpenAI(apiKey, args);
  else if (provider === "anthropic") raw = await callAnthropic(apiKey, args);
  else raw = await callGoogle(apiKey, args);

  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned) as T;
}

// --------------------------------------------------------------------
// OpenAI — Chat Completions
// --------------------------------------------------------------------
async function callOpenAI(apiKey: string, args: GenerateJSONArgs): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: modelFor("openai"),
      temperature: args.temperature ?? 0.3,
      max_tokens: args.maxTokens ?? 900,
      store: false, // opt out of server-side retention
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "{}";
}

// --------------------------------------------------------------------
// Anthropic — Messages API
// --------------------------------------------------------------------
async function callAnthropic(apiKey: string, args: GenerateJSONArgs): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelFor("anthropic"),
      max_tokens: args.maxTokens ?? 900,
      temperature: args.temperature ?? 0.3,
      system: args.system + " Respond with a single valid JSON object and nothing else.",
      messages: [{ role: "user", content: args.user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = Array.isArray(data?.content)
    ? data.content.find((b: { type?: string }) => b.type === "text")
    : null;
  return block?.text ?? "{}";
}

// --------------------------------------------------------------------
// Google — Gemini generateContent
// --------------------------------------------------------------------
async function callGoogle(apiKey: string, args: GenerateJSONArgs): Promise<string> {
  const model = modelFor("google");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generationConfig: Record<string, unknown> = {
    temperature: args.temperature ?? 0.3,
    maxOutputTokens: args.maxTokens ?? 900,
    responseMimeType: "application/json",
  };
  // Gemini 2.5 models "think" by default, which burns the output-token budget
  // (often leaving no room for the JSON answer). Disable it for deterministic,
  // fast structured output.
  if (model.includes("2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: args.system }] },
    contents: [{ role: "user", parts: [{ text: args.user }] }],
    generationConfig,
  });

  // Google's free tier intermittently returns 429/503; retry transient errors.
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    }
    lastErr = `Google ${res.status}: ${await res.text()}`;
    if ((res.status === 429 || res.status === 500 || res.status === 503) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      continue;
    }
    throw new Error(lastErr);
  }
  throw new Error(lastErr);
}
