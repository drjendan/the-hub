import "server-only";
import { getOrgKeyForProvider } from "@/lib/provider-keys";

/**
 * Text embeddings for RAG. Uses OpenAI text-embedding-3-small (1536 dims) — must
 * match the vector(1536) column in supabase/rag.sql. Key resolution: the org's
 * OpenAI BYO key if set, else the platform OPENAI_API_KEY. Returns null when no
 * OpenAI key is available anywhere (RAG then degrades gracefully — agents still
 * run, just without knowledge-base grounding).
 *
 * Note: Anthropic has no embeddings API and Google's model is a different
 * dimension, so embeddings specifically require an OpenAI key.
 */
const MODEL = "text-embedding-3-small";

async function resolveKey(orgId: string): Promise<string | null> {
  const orgKey = await getOrgKeyForProvider(orgId, "openai");
  return orgKey || process.env.OPENAI_API_KEY || null;
}

export async function embedTexts(orgId: string, texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const key = await resolveKey(orgId);
  if (!key) return null;

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, input: texts }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return (data.data as { embedding: number[] }[]).map((d) => d.embedding);
}

export async function embedQuery(orgId: string, text: string): Promise<number[] | null> {
  const out = await embedTexts(orgId, [text]);
  return out && out.length ? out[0] : null;
}
