-- =====================================================================
-- RAG grounding (pgvector). Run AFTER governance_kb.sql.
--
-- Provider-agnostic embeddings at 768 dims: Google text-embedding-004 (native
-- 768) or OpenAI text-embedding-3-small (reduced to 768). Per-tenant + RLS.
-- SAFE TO RE-RUN — it (re)creates the embedding column at 768. (If you ran an
-- earlier 1536-dim version, just re-run this file, then click "Sync knowledge".)
-- =====================================================================

create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type     text not null,            -- 'policy' | 'best_practice' | 'compliance'
  source_title    text not null,
  content         text not null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_kchunks_org on public.knowledge_chunks(organization_id);

-- (Re)create the embedding column at 768 dims. Dropping it is safe — chunks are
-- rebuilt from scratch by the "Sync knowledge" action.
drop index if exists public.idx_kchunks_embedding;
alter table public.knowledge_chunks drop column if exists embedding;
alter table public.knowledge_chunks add column embedding vector(768);
create index idx_kchunks_embedding on public.knowledge_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.knowledge_chunks enable row level security;

drop policy if exists p_kchunks_read on public.knowledge_chunks;
create policy p_kchunks_read on public.knowledge_chunks
  for select using (public.is_org_member(organization_id));

drop policy if exists p_kchunks_write on public.knowledge_chunks;
create policy p_kchunks_write on public.knowledge_chunks
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  );

-- Cosine-similarity retrieval. SECURITY INVOKER (default) so RLS on
-- knowledge_chunks still applies — a caller only matches their own org's chunks.
-- Param declared as bare `vector` so it accepts whatever dimension is in use.
create or replace function public.match_knowledge(query_embedding vector, org uuid, match_count int)
returns table (id uuid, content text, source_type text, source_title text, similarity float)
language sql stable as $$
  select kc.id, kc.content, kc.source_type, kc.source_title,
         1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks kc
  where kc.organization_id = org and kc.embedding is not null
  order by kc.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_knowledge(vector, uuid, int) to authenticated;

-- End of rag.sql
