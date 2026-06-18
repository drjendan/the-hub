import Link from "next/link";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeClient, type Entry, type Pack, type Doc } from "./knowledge-client";

export const dynamic = "force-dynamic";

export default async function KnowledgePage() {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);
  const currentOrg = orgs.find((o) => o.id === orgId) || null;
  const canManage = profile.app_role === "admin" || currentOrg?.org_role === "owner";

  if (!orgId) {
    return (
      <div className="px-6 sm:px-10 py-8 max-w-4xl mx-auto">
        <div className="card p-10 text-center text-ink-soft mt-6">
          No company selected yet. <Link href="/" className="text-accent hover:underline">Go to the dashboard</Link>.
        </div>
      </div>
    );
  }

  const supabase = createClient();
  // All fetches are resilient: a missing table (governance_kb.sql not run) just
  // yields an empty list rather than crashing the page.
  // Effective policies = this workspace's local policies ∪ account policies the
  // account admin has assigned to it. v_workspace_policies (security_invoker) is
  // the single source of truth; account-sourced rows render read-only.
  const [{ data: pol, error: polErr }, { data: bp }, { data: packRows }, { data: enabled }, { data: docRows }] = await Promise.all([
    supabase.from("v_workspace_policies").select("policy_id, title, body, category, active, created_at, is_account_policy").eq("workspace_id", orgId).order("created_at", { ascending: false }),
    supabase.from("best_practices").select("id, title, body, category, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("compliance_packs").select("id, key, name, description, industry, requirements").order("name", { ascending: true }),
    supabase.from("org_compliance_packs").select("pack_id").eq("organization_id", orgId),
    supabase.from("knowledge_documents").select("id, title, filename, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
  ]);

  // Fallback for environments where accounts.sql (the view) hasn't been run yet:
  // read workspace-local policies directly so governance still works.
  let polRows = pol as Record<string, unknown>[] | null;
  if (polErr) {
    const legacy = await supabase
      .from("policies")
      .select("id, title, body, category, active, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });
    polRows = (legacy.data as Record<string, unknown>[] | null) || [];
    polRows = polRows.map((p) => ({ ...p, policy_id: p.id, is_account_policy: false }));
  }
  const policies: Entry[] = (polRows || []).map((p) => ({
    id: p.policy_id as string,
    title: p.title as string,
    body: (p.body as string | null) ?? null,
    category: (p.category as string | null) ?? null,
    active: p.active as boolean,
    created_at: p.created_at as string,
    is_account: !!p.is_account_policy,
  }));
  const bestPractices: Entry[] = (bp || []).map((b) => ({
    id: b.id, title: b.title, body: b.body, category: b.category, created_at: b.created_at,
  }));
  const packs: Pack[] = (packRows || []).map((p) => ({
    id: p.id, key: p.key, name: p.name, description: p.description, industry: p.industry,
    requirements: Array.isArray(p.requirements) ? (p.requirements as string[]) : [],
  }));
  const enabledPackIds = (enabled || []).map((e) => e.pack_id as string);
  const documents: Doc[] = (docRows || []).map((d) => ({
    id: d.id, title: d.title, filename: d.filename, created_at: d.created_at,
  }));

  // RAG corpus size (resilient: 0 if rag.sql hasn't been run).
  const { count: chunkCount } = await supabase
    .from("knowledge_chunks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);

  return (
    <KnowledgeClient
      policies={policies}
      bestPractices={bestPractices}
      packs={packs}
      enabledPackIds={enabledPackIds}
      documents={documents}
      chunkCount={chunkCount ?? 0}
      canManage={!!canManage}
      orgName={currentOrg?.name || ""}
    />
  );
}
