-- =====================================================================
-- Delete permissions for agents & apps (run AFTER schema.sql + apps.sql)
--
-- Admin/builder deletes ALREADY work via the existing p_agents_write /
-- p_apps_write "for all" policies — you do NOT need this file for those.
-- This OPTIONAL migration additionally lets a non-admin OWNER delete their own
-- item: an agent's owner_id, or an app's product_owner. Permissive policies are
-- OR'd with the existing ones, so the effective rule becomes:
--   member of the org AND (admin/builder OR you own the item).
-- Tenant isolation still holds (is_org_member) and FK cascades clean up children.
-- =====================================================================

drop policy if exists p_agents_delete on public.agents;
create policy p_agents_delete on public.agents
  for delete using (
    public.is_org_member(organization_id)
    and (public.current_app_role() in ('admin','builder') or owner_id = auth.uid())
  );

drop policy if exists p_apps_delete on public.apps;
create policy p_apps_delete on public.apps
  for delete using (
    public.is_org_member(organization_id)
    and (public.current_app_role() in ('admin','builder') or product_owner = auth.uid())
  );

-- End of deletes.sql
