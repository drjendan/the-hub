import type { Agent, GovernanceRequest, Role, Recommendation } from "@/lib/supabase/types";

// Mirrors supabase/seed.sql so the MVP renders standalone. When Supabase env
// vars are set, the pages can be switched to live queries (see README).

export const ORG = {
  name: "Northwind Industries",
  industry: "Manufacturing & Logistics",
  size_band: "1000+",
  governance_mode: "strict",
};

export const AGENTS: Agent[] = [
  {
    id: "d0000000-0000-0000-0000-000000000001",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    slug: "invoice-triage", name: "Invoice Triage Agent",
    summary: "Reads inbound invoices, extracts line items, performs 3-way PO matching, and flags exceptions for review.",
    category: "Finance", status: "published", risk: "moderate",
    owner_id: null, owner_name: "Marcus Bell", current_version: 3,
    tags: ["finance", "ocr", "accounts-payable"],
    capabilities: ["Document extraction", "3-way matching", "Exception flagging"],
    tools: ["NetSuite", "Email"], avg_rating: 4.6, deployments: 42,
    created_at: "", updated_at: "",
  },
  {
    id: "d0000000-0000-0000-0000-000000000002",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    slug: "support-triage", name: "Support Triage Agent",
    summary: "Classifies inbound tickets, drafts first responses from the knowledge base, and routes escalations.",
    category: "Support", status: "published", risk: "low",
    owner_id: null, owner_name: "Marcus Bell", current_version: 2,
    tags: ["support", "routing", "kb"],
    capabilities: ["Intent classification", "Draft replies", "Escalation routing"],
    tools: ["Zendesk", "Slack"], avg_rating: 4.4, deployments: 67,
    created_at: "", updated_at: "",
  },
  {
    id: "d0000000-0000-0000-0000-000000000003",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    slug: "recruiter-screen", name: "Resume Screener",
    summary: "Screens inbound resumes against a role rubric and produces a structured shortlist with rationale.",
    category: "People Ops", status: "in_review", risk: "high",
    owner_id: null, owner_name: "Marcus Bell", current_version: 1,
    tags: ["hr", "screening", "bias-review"],
    capabilities: ["Rubric scoring", "Shortlist generation", "Bias checks"],
    tools: ["Greenhouse"], avg_rating: 0, deployments: 0,
    created_at: "", updated_at: "",
  },
  {
    id: "d0000000-0000-0000-0000-000000000004",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    slug: "contract-summarizer", name: "Contract Summarizer",
    summary: "Summarizes vendor contracts, surfaces renewal dates, liability caps, and non-standard clauses.",
    category: "Legal", status: "published", risk: "moderate",
    owner_id: null, owner_name: "Marcus Bell", current_version: 1,
    tags: ["legal", "summarization"],
    capabilities: ["Clause extraction", "Risk flagging", "Renewal tracking"],
    tools: ["Drive"], avg_rating: 4.2, deployments: 15,
    created_at: "", updated_at: "",
  },
  {
    id: "d0000000-0000-0000-0000-000000000005",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    slug: "sales-research", name: "Account Research Agent",
    summary: "Builds pre-call briefs on target accounts from public sources and CRM history.",
    category: "Sales", status: "draft", risk: "low",
    owner_id: null, owner_name: "Marcus Bell", current_version: 1,
    tags: ["sales", "research"],
    capabilities: ["Account briefs", "News digest", "CRM enrichment"],
    tools: ["Web", "CRM"], avg_rating: 0, deployments: 0,
    created_at: "", updated_at: "",
  },
  {
    id: "d0000000-0000-0000-0000-000000000006",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    slug: "policy-qa", name: "HR Policy Q&A",
    summary: "Answers employee questions strictly from the approved HR policy handbook with citations.",
    category: "People Ops", status: "published", risk: "low",
    owner_id: null, owner_name: "Dana Okafor", current_version: 4,
    tags: ["hr", "rag", "policy"],
    capabilities: ["Grounded answers", "Citations", "PII redaction"],
    tools: ["Drive"], avg_rating: 4.8, deployments: 88,
    created_at: "", updated_at: "",
  },
  {
    id: "d0000000-0000-0000-0000-000000000007",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    slug: "spend-anomaly", name: "Spend Anomaly Detector",
    summary: "Monitors expense submissions and flags outliers and policy violations for finance review.",
    category: "Finance", status: "blocked", risk: "restricted",
    owner_id: null, owner_name: "Marcus Bell", current_version: 2,
    tags: ["finance", "anomaly", "monitoring"],
    capabilities: ["Outlier detection", "Policy checks", "Alerting"],
    tools: ["NetSuite"], avg_rating: 3.9, deployments: 5,
    created_at: "", updated_at: "",
  },
];

export const ROLES: Role[] = [
  {
    id: "c0000000-0000-0000-0000-000000000001",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    title: "Accounts Payable Specialist", department: "Finance",
    description: "Processes invoices, matches POs, flags exceptions.",
    responsibilities: ["Invoice intake & coding", "3-way PO matching", "Exception triage", "Vendor inquiries"],
    tools_used: ["NetSuite", "Outlook", "Excel"],
  },
  {
    id: "c0000000-0000-0000-0000-000000000002",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    title: "Tier-1 Support Agent", department: "Customer Experience",
    description: "Answers product questions and routes complex tickets.",
    responsibilities: ["Ticket triage", "Knowledge-base answers", "Escalation routing"],
    tools_used: ["Zendesk", "Slack"],
  },
  {
    id: "c0000000-0000-0000-0000-000000000003",
    organization_id: "a0000000-0000-0000-0000-000000000001",
    title: "Recruiting Coordinator", department: "People Ops",
    description: "Schedules interviews and screens inbound applicants.",
    responsibilities: ["Resume screening", "Interview scheduling", "Candidate comms"],
    tools_used: ["Greenhouse", "Gmail", "Calendar"],
  },
];

export const GOVERNANCE: GovernanceRequest[] = [
  {
    id: "f0000000-0000-0000-0000-000000000001", agent_id: "d0000000-0000-0000-0000-000000000003",
    kind: "publish", status: "open", title: "Publish Resume Screener v1",
    detail: "High-risk HR agent. Requires bias review before publish.", risk: "high",
    created_at: new Date(Date.now() - 2 * 864e5).toISOString(), resolved_at: null,
  },
  {
    id: "f0000000-0000-0000-0000-000000000003", agent_id: "d0000000-0000-0000-0000-000000000007",
    kind: "policy_exception", status: "open", title: "Unblock Spend Anomaly Detector",
    detail: "Requests exception to monitor restricted expense categories.", risk: "restricted",
    created_at: new Date(Date.now() - 1 * 864e5).toISOString(), resolved_at: null,
  },
  {
    id: "f0000000-0000-0000-0000-000000000002", agent_id: "d0000000-0000-0000-0000-000000000001",
    kind: "version", status: "approved", title: "Promote Invoice Triage v3",
    detail: "Adds human-approval threshold over $5,000.", risk: "moderate",
    created_at: new Date(Date.now() - 6 * 864e5).toISOString(),
    resolved_at: new Date(Date.now() - 5 * 864e5).toISOString(),
  },
];

// Static demo recommendations keyed by role id
export const RECOMMENDATIONS: Record<string, (Recommendation & { agent_name: string })[]> = {
  "c0000000-0000-0000-0000-000000000001": [
    { id: "r1", role_id: "c0000000-0000-0000-0000-000000000001", agent_id: "d0000000-0000-0000-0000-000000000001", agent_name: "Invoice Triage Agent", rank: 1, match_score: 0.94, rationale: "Direct match: invoice intake, PO matching, and exception flagging cover the core responsibilities.", generated_by: "openai" },
    { id: "r2", role_id: "c0000000-0000-0000-0000-000000000001", agent_id: "d0000000-0000-0000-0000-000000000007", agent_name: "Spend Anomaly Detector", rank: 2, match_score: 0.61, rationale: "Complements AP work by catching anomalous spend, though currently blocked pending review.", generated_by: "openai" },
  ],
  "c0000000-0000-0000-0000-000000000002": [
    { id: "r3", role_id: "c0000000-0000-0000-0000-000000000002", agent_id: "d0000000-0000-0000-0000-000000000002", agent_name: "Support Triage Agent", rank: 1, match_score: 0.91, rationale: "Handles ticket triage, KB-grounded replies, and escalation routing end to end.", generated_by: "openai" },
  ],
  "c0000000-0000-0000-0000-000000000003": [
    { id: "r4", role_id: "c0000000-0000-0000-0000-000000000003", agent_id: "d0000000-0000-0000-0000-000000000003", agent_name: "Resume Screener", rank: 1, match_score: 0.88, rationale: "Screens resumes against a rubric and produces a structured shortlist; high-risk so requires review.", generated_by: "openai" },
  ],
};

// Daily activity for the analytics page (last 14 days)
export const ACTIVITY_14D = [12, 18, 9, 22, 27, 14, 8, 19, 31, 24, 17, 29, 35, 21];
