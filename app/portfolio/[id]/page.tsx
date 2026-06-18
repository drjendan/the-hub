import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccountAdmin, adminAccountForWorkspace } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusBadge, RiskTag } from "@/components/ui";
import type { AgentStatus, RiskTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * Workspace drill-in for an account admin (read-oriented). Access is pinned:
 * adminAccountForWorkspace returns the account id ONLY if the caller administers
 * the account that owns this workspace — otherwise we 404, so an account admin
 * can never open a workspace outside their account by guessing the id.
 */
export default async function PortfolioWorkspacePage({ params }: { params: { id: string } }) {
  const { user } = await requireAccountAdmin();
  const accountId = await adminAccountForWorkspace(user.id, params.id);
  if (!accountId) notFound();

  const db = createAdminClient();
  const { data: org } = await db
    .from("organizations")
    .select("id, name, slug, industry, size_band, governance_mode")
    .eq("id", params.id)
    .maybeSingle();
  if (!org) notFound();

  const [membersR, agentsR, appsR, runsR, govR] = await Promise.all([
    db.from("org_members").select("org_role, user:profiles(id, email, full_name, app_role)").eq("organization_id", params.id),
    db.from("agents").select("id, name, status, risk, category").eq("organization_id", params.id).order("created_at", { ascending: false }),
    db.from("apps").select("id, name, url, status, category").eq("organization_id", params.id).order("created_at", { ascending: false }),
    db.from("agent_runs").select("id, created_at, kind").eq("organization_id", params.id).order("created_at", { ascending: false }).limit(10),
    db.from("governance_requests").select("id, title, status, kind, risk").eq("organization_id", params.id).eq("status", "open"),
  ]);

  const users = ((membersR.data as Record<string, unknown>[] | null) || [])
    .map((m) => {
      const u = m.user as unknown as { id: string; email: string | null; full_name: string | null; app_role: string } | null;
      return u ? { ...u, org_role: m.org_role as string } : null;
    })
    .filter((u): u is { id: string; email: string | null; full_name: string | null; app_role: string; org_role: string } => u !== null);
  const agents = (agentsR.data as Record<string, unknown>[] | null) || [];
  const apps = appsR.error ? [] : (appsR.data as Record<string, unknown>[] | null) || [];
  const runs = runsR.error ? [] : (runsR.data as Record<string, unknown>[] | null) || [];
  const gov = (govR.data as Record<string, unknown>[] | null) || [];

  return (
    <>
      <div className="border-b hairline pb-6">
        <Link href="/portfolio" className="text-[12px] text-accent hover:underline">← Portfolio</Link>
        <h1 className="display text-[30px] font-semibold leading-none mt-2">{org.name}</h1>
        <div className="mt-2 text-[13px] text-ink-soft">
          {[org.industry, org.size_band].filter(Boolean).join(" · ") || "—"}
          <span className="mono"> · {org.slug}</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="Users" value={users.length} />
        <Stat label="Agents" value={agents.length} />
        <Stat label="Apps" value={apps.length} />
        <Stat label="Open governance" value={gov.length} highlight={gov.length > 0} />
      </div>

      <Section title="Users">
        {users.length === 0 ? <Empty>No users assigned.</Empty> : (
          <div className="space-y-2">
            {users.map((u) => (
              <Row key={u.id} title={u.full_name || u.email || "—"} sub={u.email}>
                <span className="text-[11px] uppercase tracking-wide text-ink-soft">{u.org_role} · {u.app_role}</span>
              </Row>
            ))}
          </div>
        )}
      </Section>

      <Section title="Agents">
        {agents.length === 0 ? <Empty>No agents.</Empty> : (
          <div className="space-y-2">
            {agents.map((a) => (
              <Row key={a.id as string} title={a.name as string} sub={(a.category as string | null) || "—"}>
                <div className="flex items-center gap-2">
                  <RiskTag risk={a.risk as RiskTier} />
                  <StatusBadge status={a.status as AgentStatus} />
                </div>
              </Row>
            ))}
          </div>
        )}
      </Section>

      <Section title="Apps">
        {apps.length === 0 ? <Empty>No apps.</Empty> : (
          <div className="space-y-2">
            {apps.map((a) => (
              <Row key={a.id as string} title={a.name as string} sub={[(a.category as string | null), a.url as string].filter(Boolean).join(" · ")}>
                <StatusBadge status={a.status as AgentStatus} />
              </Row>
            ))}
          </div>
        )}
      </Section>

      <Section title="Open governance">
        {gov.length === 0 ? <Empty>No open requests.</Empty> : (
          <div className="space-y-2">
            {gov.map((g) => (
              <Row key={g.id as string} title={g.title as string} sub={`${g.kind}`}>
                <RiskTag risk={g.risk as RiskTier} />
              </Row>
            ))}
          </div>
        )}
      </Section>

      <Section title="Recent run activity">
        {runs.length === 0 ? <Empty>No runs recorded.</Empty> : (
          <div className="space-y-2">
            {runs.map((r) => (
              <Row key={r.id as string} title={new Date(r.created_at as string).toLocaleString()} sub={r.kind as string} />
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className={`mt-1 text-[24px] font-semibold tabular-nums ${highlight ? "text-rust" : "text-ink"}`}>{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="display text-[18px] font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}
function Row({ title, sub, children }: { title: string; sub?: string | null; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border hairline px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate">{title}</div>
        {sub ? <div className="text-[12px] text-ink-soft truncate">{sub}</div> : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-center text-[13px] text-ink-soft">{children}</div>;
}
