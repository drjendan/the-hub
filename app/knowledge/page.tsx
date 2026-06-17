import Link from "next/link";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { KnowledgeClient, type Entry, type Pack } from "./knowledge-client";

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
  const [{ data: pol }, { data: bp }, { data: packRows }, { data: enabled }] = await Promise.all([
    supabase.from("policies").select("id, title, body, category, active, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("best_practices").select("id, title, body, category, created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
    supabase.from("compliance_packs").select("id, key, name, description, industry, requirements").order("name", { ascending: true }),
    supabase.from("org_compliance_packs").select("pack_id").eq("organization_id", orgId),
  ]);

  const policies: Entry[] = (pol || []).map((p) => ({
    id: p.id, title: p.title, body: p.body, category: p.category, active: p.active, created_at: p.created_at,
  }));
  const bestPractices: Entry[] = (bp || []).map((b) => ({
    id: b.id, title: b.title, body: b.body, category: b.category, created_at: b.created_at,
  }));
  const packs: Pack[] = (packRows || []).map((p) => ({
    id: p.id, key: p.key, name: p.name, description: p.description, industry: p.industry,
    requirements: Array.isArray(p.requirements) ? (p.requirements as string[]) : [],
  }));
  const enabledPackIds = (enabled || []).map((e) => e.pack_id as string);

  return (
    <KnowledgeClient
      policies={policies}
      bestPractices={bestPractices}
      packs={packs}
      enabledPackIds={enabledPackIds}
      canManage={!!canManage}
      orgName={currentOrg?.name || ""}
    />
  );
}
