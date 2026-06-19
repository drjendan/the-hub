-- =====================================================================
-- FIX: infinite recursion between policies and policy_workspaces RLS.
--
-- The original accounts.sql had p_policies_read subquery into policy_workspaces,
-- while p_pw_read / p_pw_write subqueried back into policies — a mutual RLS
-- reference that Postgres rejects as "infinite recursion detected in policy for
-- relation policies".
--
-- Fix: move every cross-table lookup into SECURITY DEFINER helpers (which run as
-- the table owner and bypass RLS, so they don't re-trigger the other table's
-- policy). The policies / policy_workspaces policies then reference only function
-- calls, never each other's table directly. Idempotent — safe to run once on an
-- existing database. Run AFTER accounts.sql.
-- =====================================================================

-- account_id of a policy (bypasses policies RLS → no recursion).
create or replace function public.account_of_policy(p_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from public.policies where id = p_id;
$$;

-- account_id of a workspace.
create or replace function public.account_of_workspace(org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select account_id from public.organizations where id = org;
$$;

-- Is the current user a member of any workspace this account policy is mapped to?
-- Reads policy_workspaces inside a definer fn, so it does NOT invoke that table's RLS.
create or replace function public.policy_assigned_to_member(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.policy_workspaces pw
    where pw.policy_id = p_id and public.is_workspace_member(pw.organization_id)
  );
$$;

-- ---- policies READ: no direct reference to policy_workspaces ----
drop policy if exists p_policies_read on public.policies;
create policy p_policies_read on public.policies
  for select using (
    (organization_id is not null and public.is_org_member(organization_id))
    or (
      account_id is not null and (
        public.is_account_admin(account_id)
        or public.policy_assigned_to_member(id)
      )
    )
  );

-- ---- policy_workspaces READ: no direct reference to policies ----
drop policy if exists p_pw_read on public.policy_workspaces;
create policy p_pw_read on public.policy_workspaces
  for select using (
    public.is_workspace_member(organization_id)
    or public.is_account_admin(public.account_of_policy(policy_id))
  );

-- ---- policy_workspaces WRITE: account-admin of the policy's account, and the
--       target workspace must belong to that SAME account (cross-account guard) ----
drop policy if exists p_pw_write on public.policy_workspaces;
create policy p_pw_write on public.policy_workspaces
  for all using (
    public.account_of_policy(policy_id) is not null
    and public.is_account_admin(public.account_of_policy(policy_id))
    and public.account_of_workspace(organization_id) = public.account_of_policy(policy_id)
  ) with check (
    public.account_of_policy(policy_id) is not null
    and public.is_account_admin(public.account_of_policy(policy_id))
    and public.account_of_workspace(organization_id) = public.account_of_policy(policy_id)
  );

-- End of accounts_fix_recursion.sql
