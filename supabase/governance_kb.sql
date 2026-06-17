-- =====================================================================
-- Governance Knowledge Base (Phase A). Run AFTER schema.sql + provider_keys.sql
-- (the latter defines the is_org_owner helper reused below).
--
-- Distinct from the approval queue (governance_requests/approvals). This is the
-- org's guiding knowledge: company policies, best-practice docs, and which
-- pre-defined compliance packs a company has enabled. Per-tenant + RLS:
-- members READ, company admins/owners WRITE.
-- =====================================================================

-- ---- policies (company-authored rules) ----
create table if not exists public.policies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  body            text,
  category        text,
  active          boolean not null default true,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_policies_org on public.policies(organization_id);

-- ---- best_practices (guidance docs/templates builders read) ----
create table if not exists public.best_practices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title           text not null,
  body            text,
  category        text,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_bp_org on public.best_practices(organization_id);

-- ---- compliance_packs (GLOBAL seeded catalog) ----
create table if not exists public.compliance_packs (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  description  text,
  industry     text,
  requirements jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);

-- ---- org_compliance_packs (which packs a company enabled) ----
create table if not exists public.org_compliance_packs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pack_id         uuid not null references public.compliance_packs(id) on delete cascade,
  enabled_by      uuid references public.profiles(id) on delete set null,
  enabled_at      timestamptz not null default now(),
  unique (organization_id, pack_id)
);
create index if not exists idx_ocp_org on public.org_compliance_packs(organization_id);

-- updated_at maintenance (reuses the helper from schema.sql)
drop trigger if exists trg_touch_policies on public.policies;
create trigger trg_touch_policies before update on public.policies
  for each row execute function public.fn_touch_updated_at();
drop trigger if exists trg_touch_bp on public.best_practices;
create trigger trg_touch_bp before update on public.best_practices
  for each row execute function public.fn_touch_updated_at();

-- =====================================================================
-- RLS — members read; company admins (global admin OR org owner) write.
-- =====================================================================
alter table public.policies             enable row level security;
alter table public.best_practices       enable row level security;
alter table public.compliance_packs     enable row level security;
alter table public.org_compliance_packs enable row level security;

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

drop policy if exists p_bp_read on public.best_practices;
create policy p_bp_read on public.best_practices
  for select using (public.is_org_member(organization_id));
drop policy if exists p_bp_write on public.best_practices;
create policy p_bp_write on public.best_practices
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  );

-- compliance_packs: global, read-only to any signed-in user (seeded via migration).
drop policy if exists p_packs_read on public.compliance_packs;
create policy p_packs_read on public.compliance_packs
  for select using (auth.uid() is not null);

drop policy if exists p_ocp_read on public.org_compliance_packs;
create policy p_ocp_read on public.org_compliance_packs
  for select using (public.is_org_member(organization_id));
drop policy if exists p_ocp_write on public.org_compliance_packs;
create policy p_ocp_write on public.org_compliance_packs
  for all using (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  ) with check (
    public.is_org_member(organization_id)
    and (public.current_app_role() = 'admin' or public.is_org_owner(organization_id))
  );

-- =====================================================================
-- Seed the compliance pack catalog.
-- =====================================================================
insert into public.compliance_packs (key, name, description, industry, requirements) values
  ('hipaa', 'HIPAA', 'US health data privacy & security (Health Insurance Portability and Accountability Act).', 'Healthcare',
   '["Never expose Protected Health Information (PHI) in outputs or logs","Encrypt PHI in transit and at rest","Maintain audit logs of all PHI access","Apply the minimum-necessary standard to data access","Require a Business Associate Agreement (BAA) with vendors handling PHI"]'::jsonb),
  ('ferpa', 'FERPA', 'US student education-records privacy (Family Educational Rights and Privacy Act).', 'Education',
   '["Do not disclose student education records without consent","Limit access to those with a legitimate educational interest","Allow students/parents to access and amend records","Log disclosures of education records"]'::jsonb),
  ('soc2', 'SOC 2', 'Trust Services Criteria: security, availability, processing integrity, confidentiality, privacy.', 'SaaS',
   '["Enforce least-privilege access controls","Maintain audit logging and monitoring","Encrypt sensitive data in transit and at rest","Follow a documented change-management process","Maintain an incident response plan"]'::jsonb),
  ('gdpr', 'GDPR', 'EU General Data Protection Regulation for personal data of EU residents.', 'Cross-industry',
   '["Process personal data only with a lawful basis","Honor data-subject rights (access, erasure, portability)","Apply data minimization and purpose limitation","Report personal-data breaches within 72 hours","Keep records of processing activities"]'::jsonb),
  ('ccpa', 'CCPA / CPRA', 'California Consumer Privacy Act / Privacy Rights Act consumer data rights.', 'Cross-industry',
   '["Disclose what personal information is collected and why","Honor opt-out of sale/sharing of personal information","Honor consumer rights to know, delete, and correct","Do not discriminate against consumers who exercise their rights"]'::jsonb)
on conflict (key) do nothing;

-- End of governance_kb.sql
