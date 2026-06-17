-- =====================================================================
-- Knowledge documents (uploaded PDFs / Word .docx). Run AFTER governance_kb.sql.
-- The app extracts text server-side and stores it here; the "Sync knowledge"
-- action then chunks + embeds it into knowledge_chunks for RAG. Per-tenant + RLS
-- (members read, company admins/owners write).
-- =====================================================================

create table if not exists public.knowledge_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  filename        text,
  content         text,                 -- extracted plain text
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_kdocs_org on public.knowledge_documents(organization_id);

alter table public.knowledge_documents enable row level security;

drop policy if exists p_kdocs_read on public.knowledge_documents;
create policy p_kdocs_read on public.knowledge_documents
  for select using (public.is_org_member(organization_id));

drop policy if exists p_kdocs_write on public.knowledge_documents;
create policy p_kdocs_write on public.knowledge_documents
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  );

-- End of knowledge_docs.sql
