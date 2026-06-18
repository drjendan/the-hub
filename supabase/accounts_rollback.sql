-- =====================================================================
-- STRUCTURAL ROLLBACK of accounts.sql.
--
-- Reverses the Accounts→Workspaces migration: restores is_org_member and every
-- overridden policy to its pre-account definition, then drops the new tables,
-- columns, and helpers. Safe to run only if you want to return to the flat
-- single-tenant model. (There is no DATA to preserve here by design — this is a
-- structural reversal, not a data restore.)
--
-- NOTE: this drops accounts, account_members, policy_workspaces and the
-- organizations.account_id / policies.account_id columns. Any account policies
-- (account_id set, organization_id null) are removed with the column; restore
-- organization_id NOT NULL only succeeds if no such rows remain.
-- =====================================================================

-- ---- restore is_org_member to its ORIGINAL body --------------------
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- ---- drop the view + the policies/governance split -----------------
drop view if exists public.v_workspace_policies;

-- policies: remove account policies, drop the split column/constraint, restore NOT NULL
delete from public.policies where account_id is not null;
alter table public.policies drop constraint if exists policies_scope_chk;
alter table public.policies drop column if exists account_id;
alter table public.policies alter column organization_id set not null;

drop table if exists public.policy_workspaces;

-- ---- restore ORIGINAL policies (verbatim from the source files) ----

-- organizations (schema.sql)
drop policy if exists p_org_write on public.organizations;
create policy p_org_write on public.organizations
  for update using (public.is_org_member(id) and public.current_app_role() = 'admin');

-- agents READ (agent_access.sql restricted-aware version)
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

-- agents WRITE (schema.sql)
drop policy if exists p_agents_write on public.agents;
create policy p_agents_write on public.agents
  for all using (
    public.is_org_member(organization_id) and public.current_app_role() in ('admin','builder')
  ) with check (
    public.is_org_member(organization_id) and public.current_app_role() in ('admin','builder')
  );

-- agent_versions WRITE (schema.sql)
drop policy if exists p_versions_write on public.agent_versions;
create policy p_versions_write on public.agent_versions
  for all using (
    public.is_org_member(organization_id) and public.current_app_role() in ('admin','builder')
  ) with check (
    public.is_org_member(organization_id) and public.current_app_role() in ('admin','builder')
  );

-- apps WRITE (apps.sql)
drop policy if exists p_apps_write on public.apps;
create policy p_apps_write on public.apps
  for all using (
    public.is_org_member(organization_id) and public.current_app_role() in ('admin','builder')
  ) with check (
    public.is_org_member(organization_id) and public.current_app_role() in ('admin','builder')
  );

-- governance_requests UPDATE (schema.sql)
drop policy if exists p_gov_update on public.governance_requests;
create policy p_gov_update on public.governance_requests
  for update using (public.is_org_member(organization_id) and public.can_review());

-- approvals INSERT (schema.sql)
drop policy if exists p_approvals_write on public.approvals;
create policy p_approvals_write on public.approvals
  for insert with check (public.is_org_member(organization_id) and public.can_review());

-- policies READ/WRITE (governance_kb.sql)
drop policy if exists p_policies_read on public.policies;
create policy p_policies_read on public.policies
  for select using (public.is_org_member(organization_id));
drop policy if exists p_policies_write on public.policies;
create policy p_policies_write on public.policies
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  );

-- best_practices WRITE (governance_kb.sql)
drop policy if exists p_bp_write on public.best_practices;
create policy p_bp_write on public.best_practices
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  );

-- org_compliance_packs WRITE (governance_kb.sql)
drop policy if exists p_ocp_write on public.org_compliance_packs;
create policy p_ocp_write on public.org_compliance_packs
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  );

-- knowledge_documents WRITE (knowledge_docs.sql)
drop policy if exists p_kdocs_write on public.knowledge_documents;
create policy p_kdocs_write on public.knowledge_documents
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  );

-- agent_access READ/WRITE (agent_access.sql)
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

-- ---- drop new structures + helpers ---------------------------------
alter table public.organizations drop column if exists account_id;
drop table if exists public.account_members;
drop table if exists public.accounts;

drop function if exists public.is_account_admin_of_workspace(uuid);
drop function if exists public.is_account_owner(uuid);
drop function if exists public.is_account_admin(uuid);
drop function if exists public.is_workspace_member(uuid);
-- account_role enum (drop last; no-op if other objects still reference it)
do $$ begin drop type if exists account_role; exception when others then null; end $$;

-- End of accounts_rollback.sql
