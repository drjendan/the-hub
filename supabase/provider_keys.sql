-- =====================================================================
-- Provider keys — per-tenant BYO API keys (BYOK)
-- Run AFTER schema.sql, in the Supabase SQL editor.
--
-- A company (org) may store its own AI provider key so its agent RUNS bill to
-- its own provider account instead of the shared platform key. The app encrypts
-- the key (AES-256-GCM, lib/crypto.ts) before it ever reaches this table — the
-- database only ever sees ciphertext plus a masked, non-secret hint.
--
-- TWO-LAYER PROTECTION for the secret:
--   1. RLS restricts every row to the org's OWNER (org_role = 'owner').
--   2. Column-level grants: the browser-facing Postgres roles (anon,
--      authenticated) are NOT granted SELECT on encrypted_key, so the ciphertext
--      cannot be read from the browser AT ALL — even an owner reading their own
--      row gets only the masked columns. The ciphertext is reachable solely via
--      the service role (server-side, lib/provider-keys.ts), which bypasses RLS.
-- =====================================================================

-- Is the current user an OWNER of this org? (mirrors is_org_member in schema.sql)
create or replace function public.is_org_owner(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.organization_id = org
      and m.user_id = auth.uid()
      and m.org_role = 'owner'
  );
$$;

create table if not exists public.org_provider_keys (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  provider         text not null check (provider in ('openai','anthropic','google')),
  encrypted_key    text not null,        -- AES-256-GCM ciphertext, NEVER exposed to a browser
  key_hint         text not null,        -- masked preview e.g. 'sk-a…3xQp' (safe, non-secret)
  model            text,                 -- optional per-tenant model override
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, provider)     -- one key per provider per tenant
);
create index if not exists idx_provider_keys_org on public.org_provider_keys(organization_id);

alter table public.org_provider_keys enable row level security;

-- LAYER 1 — RLS: only an org OWNER may touch that org's provider keys.
drop policy if exists p_provider_keys_owner on public.org_provider_keys;
create policy p_provider_keys_owner on public.org_provider_keys
  for all using (public.is_org_owner(organization_id))
  with check (public.is_org_owner(organization_id));

-- LAYER 2 — column privileges: revoke everything from the browser roles, then
-- grant SELECT on the NON-SECRET columns only. encrypted_key is deliberately
-- omitted, so `select encrypted_key` (or `select *`) is denied for anon /
-- authenticated even on rows RLS would otherwise expose. Writes never go through
-- these roles — the app persists keys with the service role after an owner check.
revoke all on public.org_provider_keys from anon, authenticated;
grant select (id, organization_id, provider, key_hint, model, created_by, created_at, updated_at)
  on public.org_provider_keys to authenticated;

-- Service role (server-side, RLS-bypassing) keeps full access, incl. ciphertext.
grant all on public.org_provider_keys to service_role;

-- keep updated_at fresh (reuses the helper from schema.sql)
drop trigger if exists trg_touch_provider_keys on public.org_provider_keys;
create trigger trg_touch_provider_keys before update on public.org_provider_keys
  for each row execute function public.fn_touch_updated_at();

-- End of provider_keys.sql
