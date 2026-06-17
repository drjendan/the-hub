import "server-only";
import { getOrgProviderKey, getOrgKeyForProvider } from "@/lib/provider-keys";

/**
 * Text embeddings for RAG, provider-agnostic at a fixed 768 dimensions (matches
 * the vector(768) column in supabase/rag.sql):
 *   - Google  gemini-embedding-001 (768)    → reduced via `outputDimensionality`
 *   - OpenAI  text-embedding-3-small (768)  → reduced via the `dimensions` param
 * Anthropic has no embeddings API, so a Claude-only company falls back to an
 * embedding-capable key (its own Gemini/OpenAI key, else the platform key).
 *
 * Resolution (deterministic so a given org always uses the SAME model for its
 * corpus and queries — changing keys means you should re-sync):
 *   1. the org's preferred key, if it can embed (google/openai)
 *   2. the org's specific google/openai key
 *   3. the platform OPENAI_API_KEY / GOOGLE_API_KEY
 * Returns null if none — RAG then degrades off (agents still run, ungrounded).
 */
export const EMBED_DIM = 768;
const OPENAI_MODEL = "text-embedding-3-small";
const GOOGLE_MODEL = "gemini-embedding-001";

type Embedder = { provider: "openai" | "google"; key: string };

async function resolveEmbedder(orgId: string): Promise<Embedder | null> {
  const pref = await getOrgProviderKey(orgId);
  if (pref && (pref.provider === "openai" || pref.provider === "google")) {
    return { provider: pref.provider, key: pref.apiKey };
  }
  const oai = await getOrgKeyForProvider(orgId, "openai");
  if (oai) return { provider: "openai", key: oai };
  const goog = await getOrgKeyForProvider(orgId, "google");
  if (goog) return { provider: "google", key: goog };
  if (process.env.OPENAI_API_KEY) return { provider: "openai", key: process.env.OPENAI_API_KEY };
  const platGoogle = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (platGoogle) return { provider: "google", key: platGoogle };
  return null;
}

export async function embedTexts(orgId: string, texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const e = await resolveEmbedder(orgId);
  if (!e) return null;

  const out: number[][] = [];
  const BATCH = 96; // both providers cap batch size; keep well under it
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const vecs = e.provider === "openai" ? await embedOpenAI(e.key, slice) : await embedGoogle(e.key, slice);
    out.push(...vecs);
  }
  return out;
}

export async function embedQuery(orgId: string, text: string): Promise<number[] | null> {
  const out = await embedTexts(orgId, [text]);
  return out && out.length ? out[0] : null;
}

async function embedOpenAI(key: string, texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: OPENAI_MODEL, input: texts, dimensions: EMBED_DIM }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.data as { embedding: number[] }[]).map((d) => d.embedding);
}

async function embedGoogle(key: string, texts: string[]): Promise<number[][]> {
  // gemini-embedding-001 exposes a synchronous single-text method (embedContent),
  // not a synchronous batch — so embed one text at a time.
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:embedContent?key=${key}`;
  const out: number[][] = [];
  for (const text of texts) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${GOOGLE_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBED_DIM,
      }),
    });
    if (!res.ok) throw new Error(`Google embeddings ${res.status}: ${await res.text()}`);
    const data = await res.json();
    out.push(data.embedding.values as number[]);
  }
  return out;
}
