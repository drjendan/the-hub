import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClient, type AdminOrg } from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const db = createAdminClient();

  const [{ data: orgs }, { data: members }] = await Promise.all([
    db
      .from("organizations")
      .select("id, name, slug, industry, size_band, created_at")
      .order("created_at", { ascending: false }),
    db
      .from("org_members")
      .select("organization_id, org_role, created_at, user:profiles(id, email, full_name, app_role)")
      .order("created_at", { ascending: true }),
  ]);

  const byOrg = new Map<string, AdminOrg["members"]>();
  for (const m of members || []) {
    const u = m.user as unknown as
      | { id: string; email: string | null; full_name: string | null; app_role: string }
      | null;
    if (!u) continue;
    const list = byOrg.get(m.organization_id) || [];
    list.push({
      user_id: u.id,
      email: u.email,
      full_name: u.full_name,
      app_role: u.app_role,
      org_role: m.org_role as string,
    });
    byOrg.set(m.organization_id, list);
  }

  const data: AdminOrg[] = (orgs || []).map((o) => ({
    id: o.id,
    name: o.name,
    slug: o.slug,
    industry: o.industry,
    size_band: o.size_band,
    created_at: o.created_at,
    members: byOrg.get(o.id) || [],
  }));

  return (
    <div className="px-6 sm:px-10 py-8 max-w-5xl mx-auto">
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Provider admin</div>
        <h1 className="display text-[30px] font-semibold leading-none">Companies &amp; users</h1>
        <p className="mt-2 max-w-xl text-[14px] text-ink-soft">
          Create companies (tenants) and assign users to them. Each company&apos;s agents are
          isolated from every other company by row-level security.
        </p>
      </div>

      <AdminClient orgs={data} />
    </div>
  );
}
