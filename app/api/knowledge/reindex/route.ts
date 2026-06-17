import { NextResponse } from "next/server";
import { currentOrgAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/embeddings";
import { chunkText } from "@/lib/knowledge-index";

export const runtime = "nodejs";

type Chunk = { source_type: string; source_id: string | null; source_title: string; content: string };

/**
 * POST /api/knowledge/reindex
 * Full rebuild of the org's RAG corpus from active policies, best practices,
 * enabled compliance-pack requirements, and uploaded documents. (Knowledge edits
 * auto-reindex per-item; this is the "rebuild everything" fallback.) Admin/owner.
 */
export async function POST() {
  const admin = await currentOrgAdmin();
  if (!admin) return NextResponse.json({ error: "Only a company admin or owner can sync the knowledge base." }, { status: 403 });
  const orgId = admin.orgId;
  const supabase = createClient();

  const [{ data: pol }, { data: bp }, { data: packs }, { data: docs }] = await Promise.all([
    supabase.from("policies").select("id, title, body").eq("organization_id", orgId).eq("active", true),
    supabase.from("best_practices").select("id, title, body").eq("organization_id", orgId),
    supabase.from("org_compliance_packs").select("pack:compliance_packs(id, name, requirements)").eq("organization_id", orgId),
    supabase.from("knowledge_documents").select("id, title, content").eq("organization_id", orgId),
  ]);

  const chunks: Chunk[] = [];
  for (const p of pol || []) {
    chunks.push({ source_type: "policy", source_id: p.id, source_title: p.title, content: `Policy — ${p.title}\n${p.body || ""}`.trim() });
  }
  for (const b of bp || []) {
    chunks.push({ source_type: "best_practice", source_id: b.id, source_title: b.title, content: `Best practice — ${b.title}\n${b.body || ""}`.trim() });
  }
  for (const row of packs || []) {
    const pack = row.pack as unknown as { id: string; name: string; requirements: string[] } | null;
    if (!pack) continue;
    const reqs = Array.isArray(pack.requirements) ? pack.requirements : [];
    for (const r of reqs) chunks.push({ source_type: "compliance", source_id: pack.id, source_title: pack.name, content: `${pack.name} requirement: ${r}` });
  }
  for (const d of docs || []) {
    for (const piece of chunkText((d.content as string) || "")) {
      chunks.push({ source_type: "document", source_id: d.id, source_title: d.title, content: piece });
    }
  }

  const clear = await supabase.from("knowledge_chunks").delete().eq("organization_id", orgId);
  if (clear.error) {
    return NextResponse.json(
      { error: clear.error.code === "42P01" ? "RAG isn't enabled yet. Run supabase/rag.sql." : clear.error.message },
      { status: 400 }
    );
  }
  if (chunks.length === 0) {
    return NextResponse.json({ ok: true, count: 0, message: "Nothing to index — add active policies/best practices, enable a pack, or upload a document first." });
  }

  let embeddings: number[][] | null;
  try {
    embeddings = await embedTexts(orgId, chunks.map((c) => c.content));
  } catch (err) {
    const code = (err as Error).message.match(/\b(\d{3})\b/)?.[1];
    return NextResponse.json({ error: code ? `Embedding provider error (HTTP ${code}).` : "Embedding failed." }, { status: 502 });
  }
  if (!embeddings) {
    return NextResponse.json(
      { error: "No embedding-capable key available. Add a Gemini or OpenAI key in Settings → AI Provider Keys (Claude/Anthropic can't embed), or set a platform key." },
      { status: 400 }
    );
  }

  const rows = chunks.map((c, i) => ({
    organization_id: orgId,
    source_type: c.source_type,
    source_id: c.source_id,
    source_title: c.source_title,
    content: c.content,
    embedding: JSON.stringify(embeddings![i]),
  }));
  const { error: insErr } = await supabase.from("knowledge_chunks").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: chunks.length });
}
