-- =====================================================================
-- Enterprise AI Agent Hub — Database Schema
-- Target: Supabase (PostgreSQL 15+)
-- Run order: schema.sql  ->  seed.sql
--
-- Design notes:
--   * Multi-tenant by organization_id. Every business table carries it.
--   * RBAC enforced via profiles.app_role + org_members.org_role and RLS.
--   * Immutable audit trail (audit_logs) written by triggers.
--   * Agent change history kept in agent_versions (point-in-time snapshots).
--   * Human-in-the-loop governance via governance_requests + approvals.
-- =====================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()

-- ---------------------------------------------------------------------
-- ENUM TYPES
-- ---------------------------------------------------------------------
do $$ begin
  create type app_role as enum ('admin', 'builder', 'reviewer', 'member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type org_role as enum ('owner', 'manager', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type agent_status as enum ('draft', 'in_review', 'published', 'deprecated', 'blocked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type risk_tier as enum ('low', 'moderate', 'high', 'restricted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_kind as enum ('publish', 'version', 'access', 'decommission', 'policy_exception');
exception when duplicate_object then null; end $$;

do $$ begin
  create type request_status as enum ('open', 'approved', 'rejected', 'changes_requested', 'withdrawn');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum ('active', 'idle', 'closed', 'revoked');
exception when duplicate_object then null; end $$;

-- =====================================================================
-- TABLE 1 — organizations
-- =====================================================================
create table if not exists public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  industry        text,
  size_band       text,                       -- e.g. '1-50','51-200','201-1000','1000+'
  hq_region       text,
  data_residency  text default 'us',
  governance_mode text default 'standard',    -- 'standard' | 'strict'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- TABLE 2 — profiles  (1:1 with auth.users)
-- =====================================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text,
  full_name       text,
  app_role        app_role not null default 'member',
  default_org_id  uuid references public.organizations(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =====================================================================
-- TABLE 3 — org_members  (membership + per-org role)
-- =====================================================================
create table if not exists public.org_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  org_role        org_role not null default 'staff',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index if not exists idx_org_members_user on public.org_members(user_id);
create index if not exists idx_org_members_org  on public.org_members(organization_id);

-- =====================================================================
-- TABLE 4 — intake_submissions  (corporate + role intake)
-- =====================================================================
create table if not exists public.intake_submissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  intake_type     text not null check (intake_type in ('corporate','role')),
  submitted_by    uuid references public.profiles(id) on delete set null,
  payload         jsonb not null default '{}'::jsonb,
  status          text not null default 'received',  -- received | processed | archived
  created_at      timestamptz not null default now()
);
create index if not exists idx_intake_org on public.intake_submissions(organization_id);

-- =====================================================================
-- TABLE 5 — roles  (the jobs/functions agents are matched to)
-- =====================================================================
create table if not exists public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  department      text,
  description     text,
  responsibilities jsonb not null default '[]'::jsonb,   -- string[]
  tools_used      jsonb not null default '[]'::jsonb,     -- string[]
  intake_id       uuid references public.intake_submissions(id) on delete set null,
  created_at      timestamptz not null default now()
);
create index if not exists idx_roles_org on public.roles(organization_id);

-- =====================================================================
-- TABLE 6 — agents  (catalog entry; published version pointer)
-- =====================================================================
create table if not exists public.agents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  slug             text not null,
  name             text not null,
  summary          text,
  category         text,                        -- e.g. 'Finance','HR','Support'
  status           agent_status not null default 'draft',
  risk             risk_tier not null default 'low',
  owner_id         uuid references public.profiles(id) on delete set null,
  current_version  int not null default 1,
  tags             jsonb not null default '[]'::jsonb,
  capabilities     jsonb not null default '[]'::jsonb,    -- string[]
  tools            jsonb not null default '[]'::jsonb,    -- string[] (internal tools/skills)
  connectors       jsonb not null default '[]'::jsonb,    -- string[] (connector keys; execution wired later)
  avg_rating       numeric(3,2) default 0,
  deployments      int default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug)
);
create index if not exists idx_agents_org    on public.agents(organization_id);
create index if not exists idx_agents_status on public.agents(status);

-- =====================================================================
-- TABLE 7 — agent_versions  (immutable point-in-time snapshots)
-- =====================================================================
create table if not exists public.agent_versions (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  version         int not null,
  status          agent_status not null default 'draft',
  system_prompt   text,
  model           text default 'gpt-4o-mini',
  temperature     numeric(3,2) default 0.30,
  config          jsonb not null default '{}'::jsonb,   -- tools, guardrails, etc.
  changelog       text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (agent_id, version)
);
create index if not exists idx_versions_agent on public.agent_versions(agent_id);

-- =====================================================================
-- TABLE 8 — recommendations  (role -> ranked agent matches)
-- =====================================================================
create table if not exists public.recommendations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role_id         uuid references public.roles(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete set null,
  rank            int not null default 1,
  match_score     numeric(4,3) not null default 0,       -- 0..1
  rationale       text,
  generated_by    text default 'openai',                 -- 'openai' | 'heuristic'
  created_at      timestamptz not null default now()
);
create index if not exists idx_recs_role on public.recommendations(role_id);

-- =====================================================================
-- TABLE 9 — sessions  (secure runtime sessions against an agent)
-- =====================================================================
create table if not exists public.sessions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id        uuid not null references public.agents(id) on delete cascade,
  user_id         uuid references public.profiles(id) on delete set null,
  status          session_status not null default 'active',
  ip_hash         text,                                   -- store hash, never raw IP
  user_agent      text,
  started_at      timestamptz not null default now(),
  last_active_at  timestamptz not null default now(),
  closed_at       timestamptz,
  revoked_reason  text
);
create index if not exists idx_sessions_org   on public.sessions(organization_id);
create index if not exists idx_sessions_agent on public.sessions(agent_id);

-- =====================================================================
-- TABLE 10 — session_messages  (per-turn transcript)
-- =====================================================================
create table if not exists public.session_messages (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role            text not null check (role in ('user','assistant','system','tool')),
  content         text,
  tokens          int default 0,
  created_at      timestamptz not null default now()
);
create index if not exists idx_msgs_session on public.session_messages(session_id);

-- =====================================================================
-- TABLE 11 — governance_requests  (the review queue)
-- =====================================================================
create table if not exists public.governance_requests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete cascade,
  version_id      uuid references public.agent_versions(id) on delete set null,
  kind            request_kind not null,
  status          request_status not null default 'open',
  title           text not null,
  detail          text,
  risk            risk_tier not null default 'low',
  requested_by    uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index if not exists idx_gov_org    on public.governance_requests(organization_id);
create index if not exists idx_gov_status on public.governance_requests(status);

-- =====================================================================
-- TABLE 12 — approvals  (decisions on governance_requests)
-- =====================================================================
create table if not exists public.approvals (
  id              uuid primary key default gen_random_uuid(),
  request_id      uuid not null references public.governance_requests(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  reviewer_id     uuid references public.profiles(id) on delete set null,
  decision        request_status not null,   -- approved | rejected | changes_requested
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_approvals_request on public.approvals(request_id);

-- =====================================================================
-- TABLE 13 — audit_logs  (append-only; written by triggers)
-- =====================================================================
create table if not exists public.audit_logs (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  actor_id        uuid,
  action          text not null,             -- INSERT | UPDATE | DELETE
  entity          text not null,             -- table name
  entity_id       text,
  diff            jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_audit_org    on public.audit_logs(organization_id);
create index if not exists idx_audit_entity on public.audit_logs(entity, entity_id);

-- =====================================================================
-- TABLE 14 — analytics_events  (usage telemetry)
-- =====================================================================
create table if not exists public.analytics_events (
  id              bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id        uuid references public.agents(id) on delete set null,
  user_id         uuid references public.profiles(id) on delete set null,
  event_type      text not null,             -- 'session_start','message','recommendation_view','publish'...
  properties      jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists idx_events_org  on public.analytics_events(organization_id);
create index if not exists idx_events_type on public.analytics_events(event_type);
create index if not exists idx_events_time on public.analytics_events(created_at);

-- =====================================================================
-- HELPER FUNCTIONS (used by RLS policies)
-- =====================================================================

-- Is the current user a member of this org?
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- Current user's app_role
create or replace function public.current_app_role()
returns app_role language sql stable security definer set search_path = public as $$
  select app_role from public.profiles where id = auth.uid();
$$;

-- Does the current user hold a reviewer/admin app_role?
create or replace function public.can_review()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin','reviewer'), false);
$$;

-- =====================================================================
-- AUDIT TRIGGER  (writes to audit_logs on write to governed tables)
-- =====================================================================
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  org uuid;
  eid text;
begin
  org := coalesce(
    (case when tg_op = 'DELETE' then (to_jsonb(old)->>'organization_id')
          else (to_jsonb(new)->>'organization_id') end)::uuid,
    null);
  eid := coalesce(
    (case when tg_op = 'DELETE' then (to_jsonb(old)->>'id')
          else (to_jsonb(new)->>'id') end),
    null);

  insert into public.audit_logs(organization_id, actor_id, action, entity, entity_id, diff)
  values (
    org,
    auth.uid(),
    tg_op,
    tg_table_name,
    eid,
    case tg_op
      when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
      when 'INSERT' then jsonb_build_object('new', to_jsonb(new))
      else jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
    end
  );
  return coalesce(new, old);
end $$;

drop trigger if exists trg_audit_agents on public.agents;
create trigger trg_audit_agents
  after insert or update or delete on public.agents
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_versions on public.agent_versions;
create trigger trg_audit_versions
  after insert or update or delete on public.agent_versions
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_gov on public.governance_requests;
create trigger trg_audit_gov
  after insert or update or delete on public.governance_requests
  for each row execute function public.fn_audit();

drop trigger if exists trg_audit_approvals on public.approvals;
create trigger trg_audit_approvals
  after insert or update or delete on public.approvals
  for each row execute function public.fn_audit();

-- =====================================================================
-- updated_at maintenance
-- =====================================================================
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_touch_agents on public.agents;
create trigger trg_touch_agents before update on public.agents
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_touch_orgs on public.organizations;
create trigger trg_touch_orgs before update on public.organizations
  for each row execute function public.fn_touch_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.organizations      enable row level security;
alter table public.profiles            enable row level security;
alter table public.org_members         enable row level security;
alter table public.intake_submissions  enable row level security;
alter table public.roles               enable row level security;
alter table public.agents              enable row level security;
alter table public.agent_versions      enable row level security;
alter table public.recommendations     enable row level security;
alter table public.sessions            enable row level security;
alter table public.session_messages    enable row level security;
alter table public.governance_requests enable row level security;
alter table public.approvals           enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.analytics_events    enable row level security;

-- profiles: a user can see/update only their own profile
drop policy if exists p_profiles_self on public.profiles;
create policy p_profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- organizations: members can read; only admins may write
drop policy if exists p_org_read on public.organizations;
create policy p_org_read on public.organizations
  for select using (public.is_org_member(id));
drop policy if exists p_org_write on public.organizations;
create policy p_org_write on public.organizations
  for update using (public.is_org_member(id) and public.current_app_role() = 'admin');

-- org_members: members can read membership of their orgs
drop policy if exists p_members_read on public.org_members;
create policy p_members_read on public.org_members
  for select using (public.is_org_member(organization_id));

-- Generic per-org read for tenant tables
drop policy if exists p_intake_rw on public.intake_submissions;
create policy p_intake_rw on public.intake_submissions
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists p_roles_rw on public.roles;
create policy p_roles_rw on public.roles
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- agents: members read; builders/admins write (RBAC)
drop policy if exists p_agents_read on public.agents;
create policy p_agents_read on public.agents
  for select using (public.is_org_member(organization_id));
drop policy if exists p_agents_write on public.agents;
create policy p_agents_write on public.agents
  for all using (
    public.is_org_member(organization_id)
    and public.current_app_role() in ('admin','builder')
  ) with check (
    public.is_org_member(organization_id)
    and public.current_app_role() in ('admin','builder')
  );

drop policy if exists p_versions_read on public.agent_versions;
create policy p_versions_read on public.agent_versions
  for select using (public.is_org_member(organization_id));
drop policy if exists p_versions_write on public.agent_versions;
create policy p_versions_write on public.agent_versions
  for all using (
    public.is_org_member(organization_id)
    and public.current_app_role() in ('admin','builder')
  ) with check (
    public.is_org_member(organization_id)
    and public.current_app_role() in ('admin','builder')
  );

drop policy if exists p_recs_rw on public.recommendations;
create policy p_recs_rw on public.recommendations
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- sessions: a user sees their own sessions; reviewers/admins see all org sessions
drop policy if exists p_sessions_read on public.sessions;
create policy p_sessions_read on public.sessions
  for select using (
    public.is_org_member(organization_id)
    and (user_id = auth.uid() or public.can_review())
  );
drop policy if exists p_sessions_write on public.sessions;
create policy p_sessions_write on public.sessions
  for all using (public.is_org_member(organization_id) and user_id = auth.uid())
  with check (public.is_org_member(organization_id) and user_id = auth.uid());

drop policy if exists p_msgs_rw on public.session_messages;
create policy p_msgs_rw on public.session_messages
  for all using (
    public.is_org_member(organization_id)
    and exists (
      select 1 from public.sessions s
      where s.id = session_id
        and (s.user_id = auth.uid() or public.can_review())
    )
  ) with check (public.is_org_member(organization_id));

-- governance: members read; reviewers/admins write
drop policy if exists p_gov_read on public.governance_requests;
create policy p_gov_read on public.governance_requests
  for select using (public.is_org_member(organization_id));
drop policy if exists p_gov_insert on public.governance_requests;
create policy p_gov_insert on public.governance_requests
  for insert with check (public.is_org_member(organization_id));
drop policy if exists p_gov_update on public.governance_requests;
create policy p_gov_update on public.governance_requests
  for update using (public.is_org_member(organization_id) and public.can_review());

drop policy if exists p_approvals_read on public.approvals;
create policy p_approvals_read on public.approvals
  for select using (public.is_org_member(organization_id));
drop policy if exists p_approvals_write on public.approvals;
create policy p_approvals_write on public.approvals
  for insert with check (public.is_org_member(organization_id) and public.can_review());

-- audit_logs: read-only to members; no client writes (trigger-only via definer)
drop policy if exists p_audit_read on public.audit_logs;
create policy p_audit_read on public.audit_logs
  for select using (public.is_org_member(organization_id));

drop policy if exists p_events_rw on public.analytics_events;
create policy p_events_rw on public.analytics_events
  for all using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

-- =====================================================================
-- Convenience view: agent catalog with owner name (for the Hub)
-- =====================================================================
-- DROP first, then create: this view uses `a.*`, so when a later migration adds
-- a column to agents (e.g. agent_access.sql adds `visibility`), the column order
-- shifts and `create or replace view` fails with 42P16 ("cannot change name of
-- view column ..."). Dropping sidesteps that on re-run. CASCADE is safe — nothing
-- depends on this convenience view.
drop view if exists public.v_agent_catalog cascade;
create view public.v_agent_catalog as
  select a.*, p.full_name as owner_name
  from public.agents a
  left join public.profiles p on p.id = a.owner_id;

-- =====================================================================
-- AUTH INTEGRATION  (added for the live app)
--   * Auto-create a profiles row whenever a Supabase Auth user is created
--     (sign-up OR admin invite), so foreign keys resolve without seed data.
--   * Prevent ordinary users from escalating their own app_role: only the
--     service role (auth.uid() IS NULL) may change it. The provider/admin is
--     promoted server-side via the SUPABASE_SERVICE_ROLE_KEY.
--   * Let users in the same organization read each other's basic profile, so
--     the Library can display "who created this agent".
-- =====================================================================

-- Create the profile when an auth user appears.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Block self-service role escalation. Service-role writes have auth.uid() = NULL
-- and are allowed (that is how the provider/admin gets promoted).
create or replace function public.fn_guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.app_role is distinct from old.app_role then
    new.app_role := old.app_role;   -- silently ignore the attempted change
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role before update on public.profiles
  for each row execute function public.fn_guard_profile_role();

-- Does the current user share any organization with the target user?
-- SECURITY DEFINER so it does not recurse through org_members RLS.
create or replace function public.shares_org(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.org_members a
    join public.org_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = target
  );
$$;

-- Broaden profile SELECT: yourself OR anyone in a shared org (read-only).
-- The existing p_profiles_self policy still governs writes.
drop policy if exists p_profiles_read_team on public.profiles;
create policy p_profiles_read_team on public.profiles
  for select using (id = auth.uid() or public.shares_org(id));

-- End of schema.sql
