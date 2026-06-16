-- =====================================================================
-- "Apps" — registered, launchable links to existing tools (dashboards, etc.)
-- Run AFTER schema.sql, in the Supabase SQL editor.
--
-- An app is a much simpler sibling of an agent: a governed catalog entry with
-- a URL — no system prompt, no AI provider, no run logic. It mirrors the agents
-- pattern (per-org RLS isolation, owner attribution) and reuses the SAME
-- governance flow (governance_requests + approvals): a new app starts
-- 'in_review' and only becomes 'published' (launchable) after a reviewer approves.
-- =====================================================================

-- App lifecycle — same values as agent_status so the shared StatusBadge/types work.
do $$ begin
  create type app_status as enum ('draft','in_review','published','deprecated','blocked');
exception when duplicate_object then null; end $$;

create table if not exists public.apps (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null,
  url             text not null,                 -- external launch URL (http/https)
  description     text,
  category        text,
  status          app_status not null default 'in_review',
  product_owner   uuid references public.profiles(id) on delete set null,  -- attribution
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_apps_org    on public.apps(organization_id);
create index if not exists idx_apps_status on public.apps(status);

-- Governance linkage: a governance_request can now target an agent OR an app.
alter table public.governance_requests
  add column if not exists app_id uuid references public.apps(id) on delete cascade;
create index if not exists idx_gov_app on public.governance_requests(app_id);

-- updated_at + audit trail (reuse the shared helpers/functions from schema.sql)
drop trigger if exists trg_touch_apps on public.apps;
create trigger trg_touch_apps before update on public.apps
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_audit_apps on public.apps;
create trigger trg_audit_apps
  after insert or update or delete on public.apps
  for each row execute function public.fn_audit();

-- RLS — mirrors agents exactly: members read; admins/builders write.
alter table public.apps enable row level security;

drop policy if exists p_apps_read on public.apps;
create policy p_apps_read on public.apps
  for select using (public.is_org_member(organization_id));

drop policy if exists p_apps_write on public.apps;
create policy p_apps_write on public.apps
  for all using (
    public.is_org_member(organization_id)
    and public.current_app_role() in ('admin','builder')
  ) with check (
    public.is_org_member(organization_id)
    and public.current_app_role() in ('admin','builder')
  );

-- End of apps.sql
