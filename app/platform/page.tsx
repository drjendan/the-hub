import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformClient, type AccountGroup, type TenantRow, type AccountAdmin } from "./platform-client";

export const dynamic = "force-dynamic";

/**
 * Platform portfolio overview — every ACCOUNT and its workspaces. The gate
 * (requireSuperAdmin, also in the layout) runs before the RLS-bypassing service
 * client. Counts are tallied in JS from minimal id columns — fine at demo scale.
 */
export default async function PlatformPage() {
  await requireSuperAdmin();
  const db = createAdminClient();

  const [{ data: accountRows }, { data: orgRows }, { data: members }, { data: agents }] = await Promise.all([
    db.from("accounts").select("id, name, slug, created_at").order("created_at", { ascending: false }),
    db.from("organizations").select("id, name, slug, industry, size_band, created_at, account_id").order("created_at", { ascending: false }),
    db.from("org_members").select("organization_id"),
    db.from("agents").select("id, organization_id"),
  ]);

  const appsResp = (await db.from("apps").select("organization_id")) as { data: { organization_id: string }[] | null; error: unknown };
  const apps = appsResp.error ? [] : appsResp.data ?? [];
  const keysResp = (await db.from("org_provider_keys").select("organization_id")) as { data: { organization_id: string }[] | null; error: unknown };
  const keys = keysResp.error ? [] : keysResp.data ?? [];
  const amResp = (await db
    .from("account_members")
    .select("account_id, account_role, user:profiles(id, email, full_name)")) as {
    data: Record<string, unknown>[] | null;
    error: unknown;
  };
  const accountMembers = amResp.error ? [] : amResp.data ?? [];

  const tally = (rows: { organization_id: string }[] | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows || []) m.set(r.organization_id, (m.get(r.organization_id) || 0) + 1);
    return m;
  };
  const userCounts = tally(members);
  const agentCounts = tally(agents);
  const appCounts = tally(apps);
  const byokOrgs = new Set((keys || []).map((k) => k.organization_id));
  const adminsByAccount = new Map<string, AccountAdmin[]>();
  for (const a of accountMembers) {
    const u = a.user as unknown as { id: string; email: string | null; full_name: string | null } | null;
    if (!u) continue;
    const accountId = a.account_id as string;
    const list = adminsByAccount.get(accountId) || [];
    list.push({ user_id: u.id, email: u.email, full_name: u.full_name, account_role: a.account_role as string });
    adminsByAccount.set(accountId, list);
  }

  const toRow = (o: Record<string, unknown>): TenantRow => ({
    id: o.id as string,
    name: o.name as string,
    slug: o.slug as string,
    account_id: (o.account_id as string | null) ?? null,
    industry: (o.industry as string | null) ?? null,
    size_band: (o.size_band as string | null) ?? null,
    created_at: o.created_at as string,
    users: userCounts.get(o.id as string) || 0,
    apps: appCounts.get(o.id as string) || 0,
    agents: agentCounts.get(o.id as string) || 0,
    byok: byokOrgs.has(o.id as string),
  });

  const orgs = (orgRows as Record<string, unknown>[] | null) || [];
  const byAccount = new Map<string, TenantRow[]>();
  const unassigned: TenantRow[] = [];
  for (const o of orgs) {
    const row = toRow(o);
    if (row.account_id) {
      const list = byAccount.get(row.account_id) || [];
      list.push(row);
      byAccount.set(row.account_id, list);
    } else {
      unassigned.push(row);
    }
  }

  const groups: AccountGroup[] = ((accountRows as Record<string, unknown>[] | null) || []).map((a) => ({
    id: a.id as string,
    name: a.name as string,
    slug: a.slug as string,
    created_at: a.created_at as string,
    admins: adminsByAccount.get(a.id as string) || [],
    workspaces: byAccount.get(a.id as string) || [],
  }));

  return (
    <>
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Super-admin</div>
        <h1 className="display text-[30px] font-semibold leading-none">All accounts</h1>
        <p className="mt-2 max-w-xl text-[14px] text-ink-soft">
          Every customer account and its workspaces. An account is a holding company (many workspaces)
          or a single company (one — or none yet). Create accounts and add workspaces under them.
        </p>
      </div>

      <PlatformClient groups={groups} unassigned={unassigned} />
    </>
  );
}
