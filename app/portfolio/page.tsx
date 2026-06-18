import { requireAccountAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PortfolioClient,
  type WorkspaceStat,
  type TeamMember,
  type AccountPolicyRow,
  type PackRow,
} from "./portfolio-client";

export const dynamic = "force-dynamic";

/**
 * Account-admin rollup dashboard. The caller's administered accounts come from
 * requireAccountAdmin(); the active one is chosen by ?account= (default: first).
 * Every read below is via the service role, PINNED to organizations.account_id =
 * the active account — so it can never surface another account's data.
 */
export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: { account?: string };
}) {
  const { accounts } = await requireAccountAdmin();
  const active = accounts.find((a) => a.id === searchParams.account) ?? accounts[0];
  const db = createAdminClient();

  // Workspaces in the active account (the pin).
  const { data: orgRows } = await db
    .from("organizations")
    .select("id, name, slug, industry, size_band")
    .eq("account_id", active.id)
    .order("created_at", { ascending: true });
  const workspaces = (orgRows as Record<string, unknown>[] | null) || [];
  const wsIds = workspaces.map((w) => w.id as string);

  // Per-workspace tallies — only query children when there are workspaces.
  const tally = (rows: { organization_id: string }[] | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows || []) m.set(r.organization_id, (m.get(r.organization_id) || 0) + 1);
    return m;
  };

  let agents: { organization_id: string }[] = [];
  let apps: { organization_id: string }[] = [];
  let runs: { organization_id: string }[] = [];
  let openGov: { organization_id: string }[] = [];
  let memberRows: Record<string, unknown>[] = [];
  let assignedPacks: { organization_id: string; pack_id: string }[] = [];

  if (wsIds.length > 0) {
    const [a, ap, rn, gv, mem, ocp] = await Promise.all([
      db.from("agents").select("organization_id").in("organization_id", wsIds),
      db.from("apps").select("organization_id").in("organization_id", wsIds),
      db.from("agent_runs").select("organization_id").in("organization_id", wsIds),
      db.from("governance_requests").select("organization_id").in("organization_id", wsIds).eq("status", "open"),
      db
        .from("org_members")
        .select("organization_id, org_role, user:profiles(id, email, full_name)")
        .in("organization_id", wsIds),
      db.from("org_compliance_packs").select("organization_id, pack_id").in("organization_id", wsIds),
    ]);
    agents = (a.data as typeof agents) || [];
    apps = (ap.data as typeof apps) || [];
    runs = (rn.error ? [] : (rn.data as typeof runs)) || [];
    openGov = (gv.data as typeof openGov) || [];
    memberRows = (mem.data as Record<string, unknown>[] | null) || [];
    assignedPacks = (ocp.error ? [] : (ocp.data as typeof assignedPacks)) || [];
  }

  const agentCounts = tally(agents);
  const appCounts = tally(apps);
  const runCounts = tally(runs);
  const govCounts = tally(openGov);

  const workspaceStats: WorkspaceStat[] = workspaces.map((w) => ({
    id: w.id as string,
    name: w.name as string,
    slug: w.slug as string,
    industry: (w.industry as string | null) ?? null,
    size_band: (w.size_band as string | null) ?? null,
    agents: agentCounts.get(w.id as string) || 0,
    apps: appCounts.get(w.id as string) || 0,
    runs: runCounts.get(w.id as string) || 0,
    open_gov: govCounts.get(w.id as string) || 0,
  }));

  // Team members across the account, with which workspaces each is assigned to.
  const byUser = new Map<string, TeamMember>();
  for (const m of memberRows) {
    const u = m.user as unknown as { id: string; email: string | null; full_name: string | null } | null;
    if (!u) continue;
    const tm = byUser.get(u.id) || { user_id: u.id, email: u.email, full_name: u.full_name, assignments: [] };
    tm.assignments.push({ organization_id: m.organization_id as string, org_role: m.org_role as string });
    byUser.set(u.id, tm);
  }
  const members = [...byUser.values()].sort((x, y) =>
    (x.full_name || x.email || "").localeCompare(y.full_name || y.email || "")
  );

  // Account-level policies + their workspace mappings.
  const { data: polRows } = await db
    .from("policies")
    .select("id, title, category, body, active, created_at")
    .eq("account_id", active.id)
    .order("created_at", { ascending: false });
  const policyList = (polRows as Record<string, unknown>[] | null) || [];
  const policyIds = policyList.map((p) => p.id as string);
  let mappings: { policy_id: string; organization_id: string }[] = [];
  if (policyIds.length > 0) {
    const { data: mapRows } = await db
      .from("policy_workspaces")
      .select("policy_id, organization_id")
      .in("policy_id", policyIds);
    mappings = (mapRows as typeof mappings) || [];
  }
  const policies: AccountPolicyRow[] = policyList.map((p) => ({
    id: p.id as string,
    title: p.title as string,
    category: (p.category as string | null) ?? null,
    workspace_ids: mappings.filter((m) => m.policy_id === p.id).map((m) => m.organization_id),
  }));

  // Compliance pack catalog (global) for assignment UI.
  const { data: packRows } = await db.from("compliance_packs").select("id, key, name").order("name");
  const packs: PackRow[] = ((packRows as Record<string, unknown>[] | null) || []).map((p) => ({
    id: p.id as string,
    key: p.key as string,
    name: p.name as string,
  }));

  return (
    <PortfolioClient
      accounts={accounts}
      activeAccountId={active.id}
      activeAccountName={active.name}
      workspaces={workspaceStats}
      members={members}
      policies={policies}
      packs={packs}
      assignedPacks={assignedPacks}
    />
  );
}
