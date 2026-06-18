-- =====================================================================
-- Accounts → Workspaces hierarchy  (ADDITIVE migration)
--
-- RUN ORDER: this file must run AFTER all of:
--   schema.sql, provider_keys.sql, apps.sql, governance_kb.sql,
--   knowledge_docs.sql, agent_access.sql, agent_runs.sql
-- because it OVERRIDES several policies first defined there (to add the
-- account-admin rollup) and reuses their helpers (is_org_owner, etc.).
--
-- THE MODEL
--   accounts ............ the customer / billing entity (a holding company or a
--                         single company). Lead Ventures is an account.
--   organizations ....... unchanged physical table, now a "WORKSPACE" under an
--                         account (organizations.account_id). A subsidiary.
--   account_members ..... account admins (e.g. Sean) — the ROLLUP principal who
--                         sees/manages every workspace in the account.
--   org_members ......... unchanged — the per-person ↔ per-workspace assignment.
--   policy_workspaces ... account policy ↔ which workspaces it applies to.
--
-- SECURITY MODEL (enforced by RLS below)
--   * Absolute account-to-account isolation (unchanged).
--   * Per-person workspace assignment: a member sees only workspaces they have
--     an org_members row for.
--   * Account-admin rollup: an account admin sees/manages every workspace whose
--     organizations.account_id they administer — and NOTHING outside it.
--   * The single chokepoint is_org_member(org) is redefined to include the
--     rollup, so all 22 tenant tables inherit it consistently.
--   * An account may have ZERO own workspaces (a pure holding company) or its
--     own workspace(s) (a holding company that also does operational work).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- ENUM
-- ---------------------------------------------------------------------
do $$ begin
  create type account_role as enum ('owner', 'admin');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------------------
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.account_members (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.accounts(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  account_role account_role not null default 'admin',
  created_at   timestamptz not null default now(),
  unique (account_id, user_id)
);
create index if not exists idx_account_members_user on public.account_members(user_id);
create index if not exists idx_account_members_acct on public.account_members(account_id);

-- Workspaces (organizations) gain a parent account. Nullable so the additive
-- migration never fails on pre-existing rows; the app always sets it on create.
-- ON DELETE CASCADE: deleting an account removes its workspaces (and, via the
-- existing per-table cascades, their data) — intentional for tenant teardown.
alter table public.organizations
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;
create index if not exists idx_org_account on public.organizations(account_id);

-- Policies become EITHER account-level (authored at the account, mapped to
-- workspaces via policy_workspaces) OR workspace-local (the original behavior).
alter table public.policies
  add column if not exists account_id uuid references public.accounts(id) on delete cascade;
alter table public.policies alter column organization_id drop not null;
do $$ begin
  alter table public.policies add constraint policies_scope_chk
    check ((account_id is not null)::int + (organization_id is not null)::int = 1);
exception when duplicate_object then null; end $$;
create index if not exists idx_policies_account on public.policies(account_id);

-- The account-admin's governance mapping: which workspaces an account policy
-- applies to (all / several / one). Workspace-local policies do NOT use this.
create table if not exists public.policy_workspaces (
  id              uuid primary key default gen_random_uuid(),
  policy_id       uuid not null references public.policies(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at      timestamptz not null default now(),
  unique (policy_id, organization_id)
);
create index if not exists idx_pw_policy on public.policy_workspaces(policy_id);
create index if not exists idx_pw_org    on public.policy_workspaces(organization_id);

-- updated_at maintenance (reuses fn_touch_updated_at from schema.sql)
drop trigger if exists trg_touch_accounts on public.accounts;
create trigger trg_touch_accounts before update on public.accounts
  for each row execute function public.fn_touch_updated_at();

-- =====================================================================
-- HELPER FUNCTIONS  (all SECURITY DEFINER to avoid RLS recursion)
-- =====================================================================

-- Direct workspace membership — the ORIGINAL is_org_member body, preserved so
-- the redefined is_org_member can still ask "is this a direct member?".
create or replace function public.is_workspace_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- Is the current user an admin (any role) of this account?
create or replace function public.is_account_admin(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.account_members am
    where am.account_id = acct and am.user_id = auth.uid()
  );
$$;

-- Is the current user an OWNER of this account? (manage members/structure)
create or replace function public.is_account_owner(acct uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.account_members am
    where am.account_id = acct and am.user_id = auth.uid() and am.account_role = 'owner'
  );
$$;

-- Does the current user administer the ACCOUNT that owns this workspace?
-- This is the rollup predicate and the cross-account guard in one: it only
-- matches workspaces whose organizations.account_id the user administers.
create or replace function public.is_account_admin_of_workspace(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.organizations o
    join public.account_members am on am.account_id = o.account_id
    where o.id = org and am.user_id = auth.uid()
  );
$$;

-- THE SINGLE CHOKEPOINT. Every tenant table's RLS calls this. Redefined to mean
-- "direct member of the workspace OR account admin of its parent account".
-- Direct member  → per-person workspace assignment.
-- Account admin  → rollup across the account's workspaces.
-- Neither        → no access (absolute isolation, incl. between sibling
--                  workspaces and between accounts).
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_workspace_member(org) or public.is_account_admin_of_workspace(org);
$$;

-- =====================================================================
-- RLS — new tables
-- =====================================================================
alter table public.accounts          enable row level security;
alter table public.account_members   enable row level security;
alter table public.policy_workspaces enable row level security;

-- accounts: readable by an admin of the account OR a member of any workspace
-- under it (so workspace users can resolve their account name/branding).
drop policy if exists p_accounts_read on public.accounts;
create policy p_accounts_read on public.accounts
  for select using (
    public.is_account_admin(id)
    or exists (
      select 1 from public.organizations o
      where o.account_id = accounts.id and public.is_workspace_member(o.id)
    )
  );
-- Structural writes (create/rename/delete accounts) happen via the service role
-- in the super-admin portal; from a user session, only an account OWNER may.
drop policy if exists p_accounts_write on public.accounts;
create policy p_accounts_write on public.accounts
  for all using (public.is_account_owner(id)) with check (public.is_account_owner(id));

-- account_members: an account admin sees the roster; everyone sees their own row.
drop policy if exists p_account_members_read on public.account_members;
create policy p_account_members_read on public.account_members
  for select using (public.is_account_admin(account_id) or user_id = auth.uid());
-- Only an account OWNER may add/remove account admins (prevents self-promotion;
-- the super-admin portal does the initial seed via the service role).
drop policy if exists p_account_members_write on public.account_members;
create policy p_account_members_write on public.account_members
  for all using (public.is_account_owner(account_id)) with check (public.is_account_owner(account_id));

-- policy_workspaces: readable by a member of the mapped workspace or an admin of
-- the policy's account. Writable ONLY by an admin of the policy's account AND
-- ONLY when the target workspace belongs to that SAME account — the cross-account
-- governance guard (you can never map a policy onto another account's workspace).
drop policy if exists p_pw_read on public.policy_workspaces;
create policy p_pw_read on public.policy_workspaces
  for select using (
    public.is_workspace_member(organization_id)
    or exists (
      select 1 from public.policies p
      where p.id = policy_workspaces.policy_id
        and p.account_id is not null
        and public.is_account_admin(p.account_id)
    )
  );
drop policy if exists p_pw_write on public.policy_workspaces;
create policy p_pw_write on public.policy_workspaces
  for all using (
    exists (
      select 1 from public.policies p
      join public.organizations o on o.id = policy_workspaces.organization_id
      where p.id = policy_workspaces.policy_id
        and p.account_id is not null
        and public.is_account_admin(p.account_id)
        and o.account_id = p.account_id
    )
  ) with check (
    exists (
      select 1 from public.policies p
      join public.organizations o on o.id = policy_workspaces.organization_id
      where p.id = policy_workspaces.policy_id
        and p.account_id is not null
        and public.is_account_admin(p.account_id)
        and o.account_id = p.account_id
    )
  );

-- =====================================================================
-- RLS — OVERRIDES of existing policies to grant the account-admin rollup.
-- Each adds `OR public.is_account_admin_of_workspace(organization_id)` to the
-- privileged branch so an account admin has workspace-admin powers inside their
-- account's workspaces. (Reads already flow through the redefined is_org_member;
-- these overrides cover the RBAC-gated WRITES and the restricted-agent READ.)
-- =====================================================================

-- organizations: members who are app-admins write; account admins also write.
drop policy if exists p_org_write on public.organizations;
create policy p_org_write on public.organizations
  for update using (
    (public.is_org_member(id) and public.current_app_role() = 'admin')
    or public.is_account_admin_of_workspace(id)
  );

-- agents READ (restricted-aware; overrides agent_access.sql): account admins see
-- every agent in their workspaces, including 'restricted' ones.
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
      or public.is_account_admin_of_workspace(organization_id)
    )
  );

-- agents WRITE
drop policy if exists p_agents_write on public.agents;
create policy p_agents_write on public.agents
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() in ('admin','builder')
         or public.is_account_admin_of_workspace(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() in ('admin','builder')
         or public.is_account_admin_of_workspace(organization_id))
  );

-- agent_versions WRITE
drop policy if exists p_versions_write on public.agent_versions;
create policy p_versions_write on public.agent_versions
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() in ('admin','builder')
         or public.is_account_admin_of_workspace(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() in ('admin','builder')
         or public.is_account_admin_of_workspace(organization_id))
  );

-- apps WRITE
drop policy if exists p_apps_write on public.apps;
create policy p_apps_write on public.apps
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() in ('admin','builder')
         or public.is_account_admin_of_workspace(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() in ('admin','builder')
         or public.is_account_admin_of_workspace(organization_id))
  );

-- governance_requests UPDATE (resolve/triage)
drop policy if exists p_gov_update on public.governance_requests;
create policy p_gov_update on public.governance_requests
  for update using (
    public.is_org_member(organization_id)
    and (public.can_review() or public.is_account_admin_of_workspace(organization_id))
  );

-- approvals INSERT (record a decision)
drop policy if exists p_approvals_write on public.approvals;
create policy p_approvals_write on public.approvals
  for insert with check (
    public.is_org_member(organization_id)
    and (public.can_review() or public.is_account_admin_of_workspace(organization_id))
  );

-- best_practices WRITE
drop policy if exists p_bp_write on public.best_practices;
create policy p_bp_write on public.best_practices
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id)
         or public.is_account_admin_of_workspace(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id)
         or public.is_account_admin_of_workspace(organization_id))
  );

-- org_compliance_packs WRITE (assign/unassign a pack to a workspace)
drop policy if exists p_ocp_write on public.org_compliance_packs;
create policy p_ocp_write on public.org_compliance_packs
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id)
         or public.is_account_admin_of_workspace(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id)
         or public.is_account_admin_of_workspace(organization_id))
  );

-- knowledge_documents WRITE
drop policy if exists p_kdocs_write on public.knowledge_documents;
create policy p_kdocs_write on public.knowledge_documents
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id)
         or public.is_account_admin_of_workspace(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id)
         or public.is_account_admin_of_workspace(organization_id))
  );

-- agent_access READ + WRITE (manage restricted-agent grants)
drop policy if exists p_agent_access_read on public.agent_access;
create policy p_agent_access_read on public.agent_access
  for select using (
    public.is_org_member(organization_id)
    and (
      user_id = auth.uid()
      or public.is_agent_owner(agent_id)
      or public.current_app_role() = 'admin'
      or public.is_org_owner(organization_id)
      or public.is_account_admin_of_workspace(organization_id)
    )
  );
drop policy if exists p_agent_access_write on public.agent_access;
create policy p_agent_access_write on public.agent_access
  for all using (
    public.is_org_member(organization_id)
    and (
      public.is_agent_owner(agent_id)
      or public.current_app_role() = 'admin'
      or public.is_org_owner(organization_id)
      or public.is_account_admin_of_workspace(organization_id)
    )
  ) with check (
    public.is_org_member(organization_id)
    and (
      public.is_agent_owner(agent_id)
      or public.current_app_role() = 'admin'
      or public.is_org_owner(organization_id)
      or public.is_account_admin_of_workspace(organization_id)
    )
  );

-- =====================================================================
-- RLS — policies: the account/local SPLIT (assignable governance)
-- =====================================================================

-- READ: a workspace member reads local policies of their workspace AND account
-- policies MAPPED to their workspace; an account admin reads all their account's
-- policies. Account policies mapped to OTHER workspaces stay hidden.
drop policy if exists p_policies_read on public.policies;
create policy p_policies_read on public.policies
  for select using (
    (organization_id is not null and public.is_org_member(organization_id))
    or (
      account_id is not null and (
        public.is_account_admin(account_id)
        or exists (
          select 1 from public.policy_workspaces pw
          where pw.policy_id = policies.id and public.is_workspace_member(pw.organization_id)
        )
      )
    )
  );

-- WRITE: workspace-local policies follow the original rule (+ account-admin
-- escape); account-level policies are writable only by an admin of that account.
drop policy if exists p_policies_write on public.policies;
create policy p_policies_write on public.policies
  for all using (
    (organization_id is not null and public.is_org_member(organization_id)
      and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id)
           or public.is_account_admin_of_workspace(organization_id)))
    or (account_id is not null and public.is_account_admin(account_id))
  ) with check (
    (organization_id is not null and public.is_org_member(organization_id)
      and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id)
           or public.is_account_admin_of_workspace(organization_id)))
    or (account_id is not null and public.is_account_admin(account_id))
  );

-- =====================================================================
-- Convenience view: a workspace's EFFECTIVE policies (local ∪ account-assigned).
-- RLS on the base table still applies through the view (security_invoker).
-- =====================================================================
drop view if exists public.v_workspace_policies;
create view public.v_workspace_policies
  with (security_invoker = true) as
  select o.id            as workspace_id,
         p.id            as policy_id,
         p.title,
         p.body,
         p.category,
         p.active,
         p.account_id,
         p.organization_id,
         (p.account_id is not null) as is_account_policy,
         p.created_at
  from public.organizations o
  join public.policies p
    on (p.organization_id = o.id)
    or (p.account_id is not null and exists (
          select 1 from public.policy_workspaces pw
          where pw.policy_id = p.id and pw.organization_id = o.id));

-- End of accounts.sql
