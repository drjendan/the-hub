// Shared domain types — kept in sync with supabase/schema.sql

export type AppRole = "admin" | "builder" | "reviewer" | "member";
export type OrgRole = "owner" | "manager" | "staff";
export type AgentStatus = "draft" | "in_review" | "published" | "deprecated" | "blocked";
export type RiskTier = "low" | "moderate" | "high" | "restricted";
export type RequestKind = "publish" | "version" | "access" | "decommission" | "policy_exception";
export type RequestStatus = "open" | "approved" | "rejected" | "changes_requested" | "withdrawn";
export type SessionStatus = "active" | "idle" | "closed" | "revoked";

export interface Agent {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  summary: string | null;
  category: string | null;
  status: AgentStatus;
  risk: RiskTier;
  owner_id: string | null;
  owner_name?: string | null;
  current_version: number;
  tags: string[];
  capabilities: string[];
  tools: string[];
  connectors: string[];
  avg_rating: number;
  deployments: number;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  size_band: string | null;
  governance_mode: string | null;
  created_at: string;
}

export interface AgentVersion {
  id: string;
  agent_id: string;
  version: number;
  status: AgentStatus;
  system_prompt: string | null;
  model: string;
  temperature: number;
  config: Record<string, unknown>;
  changelog: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  organization_id: string;
  title: string;
  department: string | null;
  description: string | null;
  responsibilities: string[];
  tools_used: string[];
}

export interface Recommendation {
  id: string;
  role_id: string | null;
  agent_id: string | null;
  rank: number;
  match_score: number;
  rationale: string | null;
  generated_by: string;
}

export interface GovernanceRequest {
  id: string;
  agent_id: string | null;
  kind: RequestKind;
  status: RequestStatus;
  title: string;
  detail: string | null;
  risk: RiskTier;
  created_at: string;
  resolved_at: string | null;
}

// Per-tenant BYO provider key — masked shape only (the encrypted key is never
// exposed to the client; see lib/provider-keys.ts and supabase/provider_keys.sql).
export interface OrgProviderKey {
  provider: "openai" | "anthropic" | "google";
  key_hint: string;
  model: string | null;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  agent_id: string;
  user_id: string | null;
  status: SessionStatus;
  started_at: string;
  last_active_at: string;
}

// Recommendation engine I/O (also used by /api/recommendations)
export interface RoleProfileInput {
  title: string;
  department?: string;
  responsibilities: string[];
  tools?: string[];
}

export interface AgentMatch {
  agent_id: string;
  agent_name: string;
  match_score: number; // 0..1
  rationale: string;
}
