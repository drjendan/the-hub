import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformClient, type TenantRow } from "./platform-client";

export const dynamic = "force-dynamic";

/**
 * Platform portfolio overview — every tenant with aggregate stats.
 *
 * requireSuperAdmin() (also enforced by the layout) runs before the service
 * client is constructed; the service client bypasses RLS, so this gate is the
 * only thing standing between a caller and cross-tenant data.
 *
 * Counts are tallied in JS from minimal id columns — fine for a demo-scale
 * portfolio. If tenant/agent volume grows large, move these to a SQL view or
 * RPC that returns per-org counts in one round-trip.
 */
export default async function PlatformPage() {
  await requireSuperAdmin();
  const db = createAdminClient();

  // Organizations (the tenants).
  const { data: orgs } = await db
    .from("organizations")
    .select("id, name, slug, industry, size_band, created_at")
    .order("created_at", { ascending: false });

  // Members across all tenants → per-org user counts.
  const { data: members } = await db.from("org_members").select("organization_id");

  // Agents across all tenants → per-org counts.
  const { data: agents } = await db.from("agents").select("id, organization_id");

  // Apps + provider keys are optional migrations — degrade gracefully if absent.
  const appsResp = (await db.from("apps").select("id, organization_id")) as {
    data: { organization_id: string }[] | null;
    error: unknown;
  };
  const apps = appsResp.error ? [] : appsResp.data ?? [];

  // BYOK: which orgs have at least one provider key. Select ONLY organization_id
  // — never the encrypted key — so no secret is fetched even via service role.
  const keysResp = (await db.from("org_provider_keys").select("organization_id")) as {
    data: { organization_id: string }[] | null;
    error: unknown;
  };
  const keys = keysResp.error ? [] : keysResp.data ?? [];

  const tally = (rows: { organization_id: string }[] | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows || []) m.set(r.organization_id, (m.get(r.organization_id) || 0) + 1);
    return m;
  };
  const userCounts = tally(members);
  const agentCounts = tally(agents);
  const appCounts = tally(apps);
  const byokOrgs = new Set((keys || []).map((k) => k.organization_id));

  const tenants: TenantRow[] = (orgs || []).map((o) => ({
    id: o.id as string,
    name: o.name as string,
    slug: o.slug as string,
    industry: (o.industry as string | null) ?? null,
    size_band: (o.size_band as string | null) ?? null,
    created_at: o.created_at as string,
    users: userCounts.get(o.id as string) || 0,
    apps: appCounts.get(o.id as string) || 0,
    agents: agentCounts.get(o.id as string) || 0,
    byok: byokOrgs.has(o.id as string),
  }));

  return (
    <>
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Super-admin</div>
        <h1 className="display text-[30px] font-semibold leading-none">All tenants</h1>
        <p className="mt-2 max-w-xl text-[14px] text-ink-soft">
          Every company across the platform, with users, apps, agents, and whether they&apos;ve
          configured their own AI provider key. Drill into a tenant to see its users, apps, and agents.
        </p>
      </div>

      <PlatformClient tenants={tenants} />
    </>
  );
}
