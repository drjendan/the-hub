-- =====================================================================
-- Connections — per-user OAuth links to external mailboxes (Gmail, etc.)
-- Run AFTER schema.sql, in the Supabase SQL editor.
--
-- A connection belongs to ONE user (their own mailbox). Tokens are stored
-- encrypted by the app (AES-256-GCM) before they ever reach this table — the
-- database only ever sees ciphertext. RLS restricts every row to its owner.
-- =====================================================================

create table if not exists public.connections (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  organization_id  uuid references public.organizations(id) on delete set null,
  provider         text not null check (provider in ('google','microsoft')),
  account_email    text,
  access_token     text,                 -- encrypted
  refresh_token    text,                 -- encrypted
  token_expires_at timestamptz,
  scopes           text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, provider)
);
create index if not exists idx_connections_user on public.connections(user_id);

alter table public.connections enable row level security;

-- Owner-only access: a user can read/write only their own connections.
drop policy if exists p_connections_self on public.connections;
create policy p_connections_self on public.connections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- keep updated_at fresh (reuses the helper from schema.sql)
drop trigger if exists trg_touch_connections on public.connections;
create trigger trg_touch_connections before update on public.connections
  for each row execute function public.fn_touch_updated_at();

-- End of connections.sql
