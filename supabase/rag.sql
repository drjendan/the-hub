-- =====================================================================
-- RAG grounding (pgvector). Run AFTER governance_kb.sql.
--
-- Embeds the org's governance knowledge (active policies, best-practice docs,
-- and enabled compliance-pack requirements) into vectors so agent runs can
-- retrieve relevant context and cite it. Embedding model: OpenAI
-- text-embedding-3-small (1536 dims). Per-tenant + RLS (members read).
-- =====================================================================

create extension if not exists vector;

create table if not exists public.knowledge_chunks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type     text not null,            -- 'policy' | 'best_practice' | 'compliance'
  source_title    text not null,
  content         text not null,
  embedding       vector(1536),
  created_at      timestamptz not null default now()
);
create index if not exists idx_kchunks_org on public.knowledge_chunks(organization_id);
-- Approximate-nearest-neighbour index (cosine). Requires pgvector >= 0.5 (Supabase has it).
create index if not exists idx_kchunks_embedding on public.knowledge_chunks
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
create or replace function public.match_knowledge(query_embedding vector(1536), org uuid, match_count int)
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
