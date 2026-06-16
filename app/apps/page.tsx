import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { AppsClient, type AppRow, type Member, type Org } from "./apps-client";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);

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
  const orgIds = orgs.map((o) => o.id);
  // Apps are RLS-scoped to the user's orgs; company name + logo come from the
  // already-resilient org list (so this query has no logo_url dependency).
  const [{ data: appData }, { data: memberData }] = await Promise.all([
    supabase
      .from("apps")
      .select(
        "id, name, url, description, category, status, created_at, product_owner, organization_id, owner:profiles(full_name, email)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("org_members")
      .select("organization_id, user:profiles(id, full_name, email)")
      .in("organization_id", orgIds),
  ]);

  const orgMap = new Map(orgs.map((o) => [o.id, o]));
  const canManage = profile.app_role === "admin" || profile.app_role === "builder";

  const apps: AppRow[] = (appData || []).map((a) => {
    const owner = a.owner as unknown as { full_name: string | null; email: string | null } | null;
    const org = orgMap.get(a.organization_id as string);
    return {
      id: a.id,
      name: a.name,
      url: a.url,
      description: a.description,
      category: a.category,
      status: a.status,
      created_at: a.created_at,
      owner_name: owner?.full_name || owner?.email || "Unassigned",
      org_name: org?.name || "—",
      org_logo_url: org?.logo_url ?? null,
      can_delete: canManage || a.product_owner === user.id,
    };
  });

  const membersByOrg: Record<string, Member[]> = {};
  for (const m of memberData || []) {
    const u = m.user as unknown as { id: string; full_name: string | null; email: string | null } | null;
    if (!u) continue;
    const key = m.organization_id as string;
    if (!membersByOrg[key]) membersByOrg[key] = [];
    membersByOrg[key].push({ id: u.id, name: u.full_name || u.email || "Unknown" });
  }

  const pickerOrgs: Org[] = orgs.map((o) => ({ id: o.id, name: o.name, logo_url: o.logo_url }));

  return (
    <AppsClient
      apps={apps}
      orgs={pickerOrgs}
      membersByOrg={membersByOrg}
      canCreate={canManage}
      currentUserId={user.id}
      currentOrgId={orgId}
    />
  );
}
