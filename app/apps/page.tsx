import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { AppsClient, type AppRow, type Member } from "./apps-client";

export const dynamic = "force-dynamic";

export default async function AppsPage() {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);
  const currentOrg = orgs.find((o) => o.id === orgId) || null;
  const canCreate = profile.app_role === "admin" || profile.app_role === "builder";

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
  // Apps are RLS-scoped to the user's orgs; show all and let the UI filter by
  // company (mirrors the Library). Members feed the product-owner picker.
  const [{ data: appData }, { data: memberData }] = await Promise.all([
    supabase
      .from("apps")
      .select(
        "id, name, url, description, category, status, created_at, product_owner, owner:profiles(full_name, email), org:organizations(name)"
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("org_members")
      .select("user:profiles(id, full_name, email)")
      .eq("organization_id", orgId),
  ]);

  const apps: AppRow[] = (appData || []).map((a) => {
    const owner = a.owner as unknown as { full_name: string | null; email: string | null } | null;
    const org = a.org as unknown as { name: string } | null;
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
    };
  });

  const members: Member[] = (memberData || [])
    .map((m) => {
      const u = m.user as unknown as { id: string; full_name: string | null; email: string | null } | null;
      return u ? { id: u.id, name: u.full_name || u.email || "Unknown" } : null;
    })
    .filter((m): m is Member => m !== null);

  return (
    <AppsClient
      apps={apps}
      members={members}
      companyName={currentOrg?.name || ""}
      canCreate={canCreate}
      currentUserId={user.id}
    />
  );
}
