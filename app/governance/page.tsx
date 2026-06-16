import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { GovernanceClient, type GovItem } from "./governance-client";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);
  const canReview = profile.app_role === "admin" || profile.app_role === "reviewer";

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
  const baseCols = "id, kind, status, title, detail, risk, created_at, resolved_at, agent:agents(name, slug)";

  // App-aware query. If the apps migration hasn't been run yet (no app_id column),
  // fall back to the agent-only query so the existing agent governance keeps working.
  let rows = (
    await supabase
      .from("governance_requests")
      .select(`${baseCols}, app_id, app:apps(name)`)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
  ).data as unknown as Record<string, unknown>[] | null;
  if (rows === null) {
    rows = (
      await supabase
        .from("governance_requests")
        .select(baseCols)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
    ).data as unknown as Record<string, unknown>[] | null;
  }

  const items: GovItem[] = (rows || []).map((r) => {
    const row = r as Record<string, unknown>;
    const agent = row.agent as { name: string; slug: string } | null;
    const app = row.app as { name: string } | null;
    const appId = (row.app_id as string | null) ?? null;
    return {
      id: row.id as string,
      kind: row.kind as GovItem["kind"],
      status: row.status as GovItem["status"],
      title: row.title as string,
      detail: row.detail as string | null,
      risk: row.risk as GovItem["risk"],
      created_at: row.created_at as string,
      resolved_at: row.resolved_at as string | null,
      entity: appId ? "app" : "agent",
      agent_name: agent?.name ?? null,
      agent_slug: agent?.slug ?? null,
      app_name: app?.name ?? null,
    };
  });

  return <GovernanceClient items={items} canReview={canReview} />;
}
