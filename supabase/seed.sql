-- =====================================================================
-- Enterprise AI Agent Hub — Seed Data
-- Run AFTER schema.sql, in the Supabase SQL editor (runs as owner, bypasses RLS).
--
-- Creates demo auth users so profiles FK resolves. Safe to re-run (idempotent
-- via ON CONFLICT). For a real deployment, create users through Supabase Auth
-- and replace these UUIDs.
-- =====================================================================

-- ---------- demo auth users (minimal) --------------------------------
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dana.okafor@northwind.test','{"full_name":"Dana Okafor"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','marcus.bell@northwind.test','{"full_name":"Marcus Bell"}', now(), now()),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','priya.nair@northwind.test','{"full_name":"Priya Nair"}', now(), now()),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','sam.cho@northwind.test','{"full_name":"Sam Cho"}', now(), now())
on conflict (id) do nothing;

-- ---------- organizations --------------------------------------------
insert into public.organizations (id, name, slug, industry, size_band, hq_region, governance_mode)
values
  ('a0000000-0000-0000-0000-000000000001','Northwind Industries','northwind','Manufacturing & Logistics','1000+','North America','strict')
on conflict (id) do nothing;

-- ---------- profiles --------------------------------------------------
insert into public.profiles (id, email, full_name, app_role, default_org_id) values
  ('11111111-1111-1111-1111-111111111111','dana.okafor@northwind.test','Dana Okafor','admin',   'a0000000-0000-0000-0000-000000000001'),
  ('22222222-2222-2222-2222-222222222222','marcus.bell@northwind.test','Marcus Bell','builder', 'a0000000-0000-0000-0000-000000000001'),
  ('33333333-3333-3333-3333-333333333333','priya.nair@northwind.test','Priya Nair','reviewer',  'a0000000-0000-0000-0000-000000000001'),
  ('44444444-4444-4444-4444-444444444444','sam.cho@northwind.test','Sam Cho','member',          'a0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ---------- org membership -------------------------------------------
insert into public.org_members (organization_id, user_id, org_role) values
  ('a0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','owner'),
  ('a0000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','manager'),
  ('a0000000-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','manager'),
  ('a0000000-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','staff')
on conflict (organization_id, user_id) do nothing;

-- ---------- intake submissions ---------------------------------------
insert into public.intake_submissions (id, organization_id, intake_type, submitted_by, payload, status) values
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','corporate',
   '11111111-1111-1111-1111-111111111111',
   '{"primary_goals":["reduce manual back-office work","standardize vendor comms"],"compliance":["SOC2","GDPR"],"data_sensitivity":"high"}',
   'processed'),
  ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','role',
   '22222222-2222-2222-2222-222222222222',
   '{"role_title":"Accounts Payable Specialist","pain_points":["invoice triage","duplicate detection"],"tools":["NetSuite","Outlook"]}',
   'processed')
on conflict (id) do nothing;

-- ---------- roles -----------------------------------------------------
insert into public.roles (id, organization_id, title, department, description, responsibilities, tools_used, intake_id) values
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
   'Accounts Payable Specialist','Finance','Processes invoices, matches POs, flags exceptions.',
   '["Invoice intake & coding","3-way PO matching","Exception triage","Vendor inquiries"]',
   '["NetSuite","Outlook","Excel"]','b0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',
   'Tier-1 Support Agent','Customer Experience','Answers product questions and routes complex tickets.',
   '["Ticket triage","Knowledge-base answers","Escalation routing"]',
   '["Zendesk","Slack"]', null),
  ('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001',
   'Recruiting Coordinator','People Ops','Schedules interviews and screens inbound applicants.',
   '["Resume screening","Interview scheduling","Candidate comms"]',
   '["Greenhouse","Gmail","Calendar"]', null)
on conflict (id) do nothing;

-- ---------- agents ----------------------------------------------------
insert into public.agents
  (id, organization_id, slug, name, summary, category, status, risk, owner_id, current_version, tags, capabilities, tools, avg_rating, deployments)
values
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','invoice-triage','Invoice Triage Agent',
   'Reads inbound invoices, extracts line items, performs 3-way PO matching, and flags exceptions for review.',
   'Finance','published','moderate','22222222-2222-2222-2222-222222222222',3,
   '["finance","ocr","accounts-payable"]','["Document extraction","3-way matching","Exception flagging"]','["NetSuite","Email"]',4.6,42),

  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','support-triage','Support Triage Agent',
   'Classifies inbound tickets, drafts first responses from the knowledge base, and routes escalations.',
   'Support','published','low','22222222-2222-2222-2222-222222222222',2,
   '["support","routing","kb"]','["Intent classification","Draft replies","Escalation routing"]','["Zendesk","Slack"]',4.4,67),

  ('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','recruiter-screen','Resume Screener',
   'Screens inbound resumes against a role rubric and produces a structured shortlist with rationale.',
   'People Ops','in_review','high','22222222-2222-2222-2222-222222222222',1,
   '["hr","screening","bias-review"]','["Rubric scoring","Shortlist generation","Bias checks"]','["Greenhouse"]',0,0),

  ('d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','contract-summarizer','Contract Summarizer',
   'Summarizes vendor contracts, surfaces renewal dates, liability caps, and non-standard clauses.',
   'Legal','published','moderate','22222222-2222-2222-2222-222222222222',1,
   '["legal","summarization"]','["Clause extraction","Risk flagging","Renewal tracking"]','["Drive"]',4.2,15),

  ('d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','sales-research','Account Research Agent',
   'Builds pre-call briefs on target accounts from public sources and CRM history.',
   'Sales','draft','low','22222222-2222-2222-2222-222222222222',1,
   '["sales","research"]','["Account briefs","News digest","CRM enrichment"]','["Web","CRM"]',0,0),

  ('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','policy-qa','HR Policy Q&A',
   'Answers employee questions strictly from the approved HR policy handbook with citations.',
   'People Ops','published','low','11111111-1111-1111-1111-111111111111',4,
   '["hr","rag","policy"]','["Grounded answers","Citations","PII redaction"]','["Drive"]',4.8,88),

  ('d0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','spend-anomaly','Spend Anomaly Detector',
   'Monitors expense submissions and flags outliers and policy violations for finance review.',
   'Finance','blocked','restricted','22222222-2222-2222-2222-222222222222',2,
   '["finance","anomaly","monitoring"]','["Outlier detection","Policy checks","Alerting"]','["NetSuite"]',3.9,5)
on conflict (id) do nothing;

-- ---------- agent versions -------------------------------------------
insert into public.agent_versions (agent_id, organization_id, version, status, system_prompt, model, temperature, config, changelog, created_by) values
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',1,'deprecated','You are an AP assistant.','gpt-4o-mini',0.2,'{}','Initial release','22222222-2222-2222-2222-222222222222'),
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',2,'deprecated','You are an AP assistant. Always cite the PO number.','gpt-4o-mini',0.2,'{"guardrails":["no-payment-execution"]}','Added PO citation + guardrail','22222222-2222-2222-2222-222222222222'),
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',3,'published','You are an AP assistant. Cite PO numbers and never approve payment.','gpt-4o-mini',0.2,'{"guardrails":["no-payment-execution","human-approval-over-5000"]}','Approval threshold + exception routing','22222222-2222-2222-2222-222222222222'),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',1,'deprecated','You triage support tickets.','gpt-4o-mini',0.3,'{}','Initial release','22222222-2222-2222-2222-222222222222'),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',2,'published','You triage support tickets and draft grounded replies.','gpt-4o-mini',0.3,'{"kb":"zendesk-help-center"}','Grounded drafting from KB','22222222-2222-2222-2222-222222222222'),
  ('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001',4,'published','Answer ONLY from the approved handbook. Refuse otherwise.','gpt-4o-mini',0.0,'{"rag":true,"redact_pii":true}','Stricter grounding + PII redaction','11111111-1111-1111-1111-111111111111')
on conflict (agent_id, version) do nothing;

-- ---------- recommendations (role -> agents) -------------------------
insert into public.recommendations (organization_id, role_id, agent_id, rank, match_score, rationale, generated_by) values
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001',1,0.94,'Direct match: invoice intake, PO matching, and exception flagging cover the core responsibilities.','openai'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000007',2,0.61,'Complements AP work by catching anomalous spend, though currently blocked pending review.','openai'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002',1,0.91,'Handles ticket triage, KB-grounded replies, and escalation routing end to end.','openai'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000003',1,0.88,'Screens resumes against a rubric and produces a structured shortlist; high-risk so requires review.','openai')
on conflict do nothing;

-- ---------- sessions + messages --------------------------------------
insert into public.sessions (id, organization_id, agent_id, user_id, status, ip_hash, user_agent, started_at, last_active_at) values
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000006','44444444-4444-4444-4444-444444444444','closed','sha256:9af1','Mozilla/5.0', now() - interval '3 days', now() - interval '3 days'),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','44444444-4444-4444-4444-444444444444','active','sha256:3b2c','Mozilla/5.0', now() - interval '40 minutes', now() - interval '2 minutes')
on conflict (id) do nothing;

insert into public.session_messages (session_id, organization_id, role, content, tokens) values
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','user','How many PTO days carry over?',12),
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','assistant','Per the handbook (§4.2), up to 5 days carry over to the next year.',24),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','user','Ticket: customer cannot reset password.',14),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','assistant','Classified as Account Access. Drafted reset steps and routed to Tier-1 queue.',28)
on conflict do nothing;

-- ---------- governance queue + approvals -----------------------------
insert into public.governance_requests (id, organization_id, agent_id, kind, status, title, detail, risk, requested_by, created_at) values
  ('f0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003','publish','open',
   'Publish Resume Screener v1','High-risk HR agent. Requires bias review before publish.','high','22222222-2222-2222-2222-222222222222', now() - interval '2 days'),
  ('f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','version','approved',
   'Promote Invoice Triage v3','Adds human-approval threshold over $5,000.','moderate','22222222-2222-2222-2222-222222222222', now() - interval '6 days'),
  ('f0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000007','policy_exception','open',
   'Unblock Spend Anomaly Detector','Requests exception to monitor restricted expense categories.','restricted','22222222-2222-2222-2222-222222222222', now() - interval '1 day')
on conflict (id) do nothing;

update public.governance_requests set resolved_at = now() - interval '5 days'
  where id = 'f0000000-0000-0000-0000-000000000002';

insert into public.approvals (request_id, organization_id, reviewer_id, decision, note) values
  ('f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','approved','Threshold and audit logging verified. Approved for production.')
on conflict do nothing;

-- ---------- analytics events (spread over the last 30 days) ----------
insert into public.analytics_events (organization_id, agent_id, user_id, event_type, properties, created_at)
select
  'a0000000-0000-0000-0000-000000000001',
  (array['d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000006'])[1 + floor(random()*3)]::uuid,
  '44444444-4444-4444-4444-444444444444',
  (array['session_start','message','recommendation_view'])[1 + floor(random()*3)],
  '{}'::jsonb,
  now() - (random() * interval '30 days')
from generate_series(1, 240);

-- End of seed.sql
