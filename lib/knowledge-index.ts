import "server-only";
import { createClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/embeddings";

/**
 * Incremental RAG indexing helpers. Each knowledge item (policy, best practice,
 * compliance pack, document) owns its chunks via source_id, so an edit re-embeds
 * just that item. All operations are BEST-EFFORT — a knowledge edit must never
 * fail because indexing/embeddings are unavailable (the manual "Sync knowledge"
 * action surfaces real errors and can rebuild everything).
 */

/** Split long document text into ~1200-char chunks on paragraph boundaries. */
export function chunkText(text: string, maxLen = 1200): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  if (clean.length <= maxLen) return [clean];
  const chunks: string[] = [];
  let cur = "";
  for (const para of clean.split(/\n{2,}/)) {
    let p = para;
    while (p.length > maxLen) {
      if (cur) { chunks.push(cur.trim()); cur = ""; }
      chunks.push(p.slice(0, maxLen));
      p = p.slice(maxLen);
    }
    if ((cur + "\n\n" + p).length > maxLen && cur) { chunks.push(cur.trim()); cur = p; }
    else cur = cur ? cur + "\n\n" + p : p;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

/** Replace one source's chunks with freshly embedded ones. */
export async function reembedSource(
  orgId: string,
  sourceType: string,
  sourceId: string,
  sourceTitle: string,
  contents: string[]
): Promise<void> {
  try {
    const db = createClient();
    await db.from("knowledge_chunks").delete().eq("organization_id", orgId).eq("source_id", sourceId);
    if (contents.length === 0) return;
    const embeddings = await embedTexts(orgId, contents);
    if (!embeddings) return;
    await db.from("knowledge_chunks").insert(
      contents.map((c, i) => ({
        organization_id: orgId,
        source_type: sourceType,
        source_id: sourceId,
        source_title: sourceTitle,
        content: c,
        embedding: JSON.stringify(embeddings[i]),
      }))
    );
  } catch {
    // best-effort
  }
}

/** Remove one source's chunks (on delete / deactivate). */
export async function removeSource(orgId: string, sourceId: string): Promise<void> {
  try {
    const db = createClient();
    await db.from("knowledge_chunks").delete().eq("organization_id", orgId).eq("source_id", sourceId);
  } catch {
    // best-effort
  }
}

/** Content string for a policy / best-practice entry. */
export function entryContent(kind: "Policy" | "Best practice", title: string, body: string | null): string {
  return `${kind} — ${title}\n${body || ""}`.trim();
}
