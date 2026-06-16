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
  const { data } = await supabase
    .from("governance_requests")
    .select("id, kind, status, title, detail, risk, created_at, resolved_at, agent:agents(name, slug)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false });

  const items: GovItem[] = (data || []).map((r) => {
    const agent = r.agent as unknown as { name: string; slug: string } | null;
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      title: r.title,
      detail: r.detail,
      risk: r.risk,
      created_at: r.created_at,
      resolved_at: r.resolved_at,
      agent_name: agent?.name ?? null,
      agent_slug: agent?.slug ?? null,
    };
  });

  return <GovernanceClient items={items} canReview={canReview} />;
}
