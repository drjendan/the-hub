import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { StatusBadge, RiskTag } from "@/components/ui";
import type { AgentStatus, RiskTier } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

/**
 * Tenant drill-in for the platform owner — read-only view of one company's
 * users, apps, and agents. requireSuperAdmin() (also enforced by the layout)
 * runs before the RLS-bypassing service client is constructed.
 */
export default async function TenantDetailPage({ params }: { params: { id: string } }) {
  await requireSuperAdmin();
  const db = createAdminClient();

  const { data: org } = await db
    .from("organizations")
    .select("id, name, slug, industry, size_band, governance_mode, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!org) notFound();

  const { data: members } = await db
    .from("org_members")
    .select("org_role, created_at, user:profiles(id, email, full_name, app_role)")
    .eq("organization_id", params.id)
    .order("created_at", { ascending: true });

  const { data: agents } = await db
    .from("agents")
    .select("id, name, status, risk, category, created_at")
    .eq("organization_id", params.id)
    .order("created_at", { ascending: false });

  // Apps is an optional migration — degrade gracefully if the table is absent.
  const appsResp = (await db
    .from("apps")
    .select("id, name, url, status, category")
    .eq("organization_id", params.id)
    .order("created_at", { ascending: false })) as {
    data: { id: string; name: string; url: string; status: string; category: string | null }[] | null;
    error: unknown;
  };
  const apps = appsResp.error ? [] : appsResp.data ?? [];

  const users = (members || [])
    .map((m) => {
      const u = m.user as unknown as
        | { id: string; email: string | null; full_name: string | null; app_role: string }
        | null;
      return u ? { ...u, org_role: m.org_role as string } : null;
    })
    .filter((u): u is { id: string; email: string | null; full_name: string | null; app_role: string; org_role: string } => u !== null);

  return (
    <>
      <div className="border-b hairline pb-6">
        <Link href="/platform" className="text-[12px] text-accent hover:underline">← All tenants</Link>
        <h1 className="display text-[30px] font-semibold leading-none mt-2">{org.name}</h1>
        <div className="mt-2 text-[13px] text-ink-soft">
          {[org.industry, org.size_band].filter(Boolean).join(" · ") || "—"}
          <span className="mono"> · {org.slug}</span>
          {org.governance_mode ? <> · governance: <span className="text-ink">{org.governance_mode}</span></> : null}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <Stat label="Users" value={users.length} />
        <Stat label="Apps" value={apps.length} />
        <Stat label="Agents" value={(agents || []).length} />
      </div>

      {/* Users */}
      <Section title="Users">
        {users.length === 0 ? (
          <Empty>No users in this tenant yet.</Empty>
        ) : (
          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border hairline px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{u.full_name || u.email || "—"}</div>
                  <div className="text-[12px] text-ink-soft truncate">{u.email}</div>
                </div>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-soft">
                  {u.org_role} · {u.app_role}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Apps */}
      <Section title="Apps">
        {apps.length === 0 ? (
          <Empty>No apps in this tenant.</Empty>
        ) : (
          <div className="space-y-2">
            {apps.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border hairline px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{a.name}</div>
                  <div className="text-[12px] text-ink-soft truncate">{[a.category, a.url].filter(Boolean).join(" · ")}</div>
                </div>
                <StatusBadge status={a.status as AgentStatus} />
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Agents */}
      <Section title="Agents">
        {(agents || []).length === 0 ? (
          <Empty>No agents in this tenant.</Empty>
        ) : (
          <div className="space-y-2">
            {(agents || []).map((a) => (
              <div key={a.id as string} className="flex items-center justify-between gap-3 rounded-lg border hairline px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{a.name as string}</div>
                  <div className="text-[12px] text-ink-soft truncate">{(a.category as string | null) || "—"}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <RiskTag risk={a.risk as RiskTier} />
                  <StatusBadge status={a.status as AgentStatus} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 text-[24px] font-semibold tabular-nums">{value}</div>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="card p-6 text-center text-[13px] text-ink-soft">{children}</div>;
}
