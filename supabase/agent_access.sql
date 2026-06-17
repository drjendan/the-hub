-- =====================================================================
-- Per-agent access control. Run AFTER schema.sql.
--
-- An agent is 'everyone' (all company members — current default) or 'restricted'
-- (only the owner + assigned users + company admins/owner). The restricted-aware
-- read policy below enforces BOTH catalog visibility AND run access in one place:
-- the run routes load the agent through RLS, so a hidden agent returns 404 and
-- cannot be run. Tenant isolation is unchanged (everything is is_org_member-scoped).
-- =====================================================================

alter table public.agents add column if not exists visibility text not null default 'everyone';
do $$ begin
  alter table public.agents add constraint agents_visibility_chk check (visibility in ('everyone','restricted'));
exception when duplicate_object then null; end $$;

create table if not exists public.agent_access (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  granted_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (agent_id, user_id)
);
create index if not exists idx_agent_access_agent on public.agent_access(agent_id);
create index if not exists idx_agent_access_user  on public.agent_access(user_id);

-- SECURITY DEFINER helpers — bypass RLS to avoid recursion (mirrors shares_org).
create or replace function public.is_agent_owner(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agents ag where ag.id = a and ag.owner_id = auth.uid());
$$;

create or replace function public.has_agent_access(a uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agent_access aa where aa.agent_id = a and aa.user_id = auth.uid());
$$;

-- Restricted-aware read: everyone-visible OR owner OR assigned OR company admin/owner.
drop policy if exists p_agents_read on public.agents;
create policy p_agents_read on public.agents
  for select using (
    public.is_org_member(organization_id)
    and (
      visibility = 'everyone'
      or owner_id = auth.uid()
      or public.has_agent_access(id)
      or public.current_app_role() = 'admin'
      or public.is_org_owner(organization_id)
    )
  );

alter table public.agent_access enable row level security;

-- Read the assignment list: the agent owner, company admin/owner, or yourself.
drop policy if exists p_agent_access_read on public.agent_access;
create policy p_agent_access_read on public.agent_access
  for select using (
    public.is_org_member(organization_id)
    and (
      user_id = auth.uid()
      or public.is_agent_owner(agent_id)
      or public.current_app_role() = 'admin'
      or public.is_org_owner(organization_id)
    )
  );

-- Write assignments: the agent owner or company admin/owner.
drop policy if exists p_agent_access_write on public.agent_access;
create policy p_agent_access_write on public.agent_access
  for all using (
    public.is_org_member(organization_id)
    and (
      public.is_agent_owner(agent_id)
      or public.current_app_role() = 'admin'
      or public.is_org_owner(organization_id)
    )
  ) with check (
    public.is_org_member(organization_id)
    and (
      public.is_agent_owner(agent_id)
      or public.current_app_role() = 'admin'
      or public.is_org_owner(organization_id)
    )
  );

-- End of agent_access.sql
