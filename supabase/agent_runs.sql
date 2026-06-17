-- =====================================================================
-- agent_runs — history of agent executions. Run AFTER schema.sql.
--
-- Foundation for run history and the later trust features (citations,
-- confidence, hallucination feedback) — those columns are included now (nullable)
-- so no follow-up migration is needed when that phase lands.
-- =====================================================================

create table if not exists public.agent_runs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id        uuid not null references public.agents(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  kind            text not null default 'text',     -- 'text' | 'gmail'
  source          text,                              -- 'pasted' | 'txt' | 'pdf' | 'gmail'
  input           text,
  output          text,
  -- forward-compatible (trust phase): populated later
  confidence      numeric(4,3),
  citations       jsonb,
  accurate        boolean,
  hallucinated    boolean,
  rated_by        uuid references public.profiles(id) on delete set null,
  rated_at        timestamptz,
  created_at      timestamptz not null default now()
);
-- Idempotent in case the table already exists from an earlier run of this file.
alter table public.agent_runs add column if not exists source text;

create index if not exists idx_runs_org     on public.agent_runs(organization_id);
create index if not exists idx_runs_agent   on public.agent_runs(agent_id);
create index if not exists idx_runs_created on public.agent_runs(created_at);

alter table public.agent_runs enable row level security;

-- Read: you see your own runs; reviewers/admins see all org runs (mirrors sessions).
drop policy if exists p_runs_read on public.agent_runs;
create policy p_runs_read on public.agent_runs
  for select using (
    public.is_org_member(organization_id)
    and (user_id = auth.uid() or public.can_review())
  );

-- Insert: a member logs their own run.
drop policy if exists p_runs_insert on public.agent_runs;
create policy p_runs_insert on public.agent_runs
  for insert with check (
    public.is_org_member(organization_id) and user_id = auth.uid()
  );

-- Update (feedback, later): reviewers/admins only.
drop policy if exists p_runs_update on public.agent_runs;
create policy p_runs_update on public.agent_runs
  for update using (public.is_org_member(organization_id) and public.can_review());

-- End of agent_runs.sql
