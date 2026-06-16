import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminClient, type AdminOrg } from "./admin-client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const db = createAdminClient();

  const membersPromise = db
    .from("org_members")
    .select("organization_id, org_role, created_at, user:profiles(id, email, full_name, app_role)")
    .order("created_at", { ascending: true });

  // logo_url may not exist yet (logos.sql not run) — fall back without it.
  let orgsResp = (await db
    .from("organizations")
    .select("id, name, slug, industry, size_band, created_at, logo_url")
    .order("created_at", { ascending: false })) as unknown as { data: Record<string, unknown>[] | null; error: unknown };
  if (orgsResp.error) {
    orgsResp = (await db
      .from("organizations")
      .select("id, name, slug, industry, size_band, created_at")
      .order("created_at", { ascending: false })) as unknown as { data: Record<string, unknown>[] | null; error: unknown };
  }
  const orgs = orgsResp.data;
  const { data: members } = await membersPromise;

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
    id: o.id as string,
    name: o.name as string,
    slug: o.slug as string,
    industry: (o.industry as string | null) ?? null,
    size_band: (o.size_band as string | null) ?? null,
    created_at: o.created_at as string,
    logo_url: (o.logo_url as string | null) ?? null,
    members: byOrg.get(o.id as string) || [],
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
