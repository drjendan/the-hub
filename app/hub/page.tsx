import { createClient } from "@/lib/supabase/server";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { HubClient, type AgentRow } from "./hub-client";

export const dynamic = "force-dynamic";

export default async function HubPage() {
  const user = await getUser();
  const profile = user ? await ensureProfile(user) : null;
  const canManage = profile?.app_role === "admin" || profile?.app_role === "builder";

  // Scope to the ACTIVE workspace. RLS isn't enough on its own — an account admin
  // can read every workspace in their account, so without this filter the library
  // would merge all of them. No active workspace → nothing to list.
  const orgs = user ? await getOrgsForUser(user.id) : [];
  const orgId = profile ? await getCurrentOrgId(orgs, profile) : null;
  const supabase = createClient();

  const { data } = orgId
    ? await supabase
        .from("agents")
        .select(
          "id, slug, name, summary, category, status, risk, current_version, connectors, tags, created_at, owner_id, organization_id, owner:profiles(full_name, email), org:organizations(name)"
        )
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false })
    : { data: [] };

  const agents: AgentRow[] = (data || []).map((a) => {
    const owner = a.owner as unknown as { full_name: string | null; email: string | null } | null;
    const org = a.org as unknown as { name: string } | null;
    return {
      id: a.id,
      slug: a.slug,
      name: a.name,
      summary: a.summary,
      category: a.category,
      status: a.status,
      risk: a.risk,
      current_version: a.current_version,
      connectors: Array.isArray(a.connectors) ? (a.connectors as string[]) : [],
      tags: Array.isArray(a.tags) ? (a.tags as string[]) : [],
      created_at: a.created_at,
      owner_id: a.owner_id,
      owner_name: owner?.full_name || owner?.email || "Unknown",
      org_name: org?.name || "—",
      is_mine: !!user && a.owner_id === user.id,
      can_delete: canManage || (!!user && a.owner_id === user.id),
    };
  });

  return <HubClient agents={agents} />;
}
