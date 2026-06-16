import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { StatTile } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);

  if (!orgId) {
    return (
      <div className="px-6 sm:px-10 py-8 max-w-3xl mx-auto">
        <div className="card p-10 text-center text-ink-soft mt-6">
          No company selected yet. <Link href="/" className="text-accent hover:underline">Go to the dashboard</Link>.
        </div>
      </div>
    );
  }

  const supabase = createClient();

  // Last 14 days window for the activity chart.
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const [{ data: agentRows }, { data: events }] = await Promise.all([
    supabase.from("agents").select("status, risk, category").eq("organization_id", orgId),
    supabase
      .from("analytics_events")
      .select("created_at")
      .eq("organization_id", orgId)
      .gte("created_at", since.toISOString()),
  ]);

  const agents = agentRows || [];

  const byCategory = Object.entries(
    agents.reduce<Record<string, number>>((acc, a) => {
      const c = a.category ?? "Other";
      acc[c] = (acc[c] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(...byCategory.map(([, v]) => v), 1);

  const byRisk = (["low", "moderate", "high", "restricted"] as const).map((r) => ({
    r,
    n: agents.filter((a) => a.risk === r).length,
  }));
  const riskColor: Record<string, string> = { low: "bg-moss", moderate: "bg-gold", high: "bg-accent", restricted: "bg-rust" };

  // Bucket events into 14 daily counts.
  const days: number[] = Array.from({ length: 14 }, () => 0);
  for (const e of events || []) {
    const d = new Date(e.created_at);
    const idx = Math.floor((d.getTime() - since.getTime()) / 86400000);
    if (idx >= 0 && idx < 14) days[idx]++;
  }
  const peak = Math.max(...days, 1);
  const totalEvents = days.reduce((a, b) => a + b, 0);

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Insights</div>
        <h1 className="display text-[30px] font-semibold leading-none">Analytics</h1>
        <p className="mt-2 text-[14px] text-ink-soft">Adoption and risk posture across your catalog.</p>
      </div>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total agents" value={String(agents.length)} hint="this company" delay="rise-1" />
        <StatTile label="Published" value={String(agents.filter((a) => a.status === "published").length)} hint="live" delay="rise-2" />
        <StatTile label="Events (14d)" value={String(totalEvents)} hint="usage telemetry" delay="rise-3" />
        <StatTile label="Restricted" value={String(agents.filter((a) => a.risk === "restricted").length)} hint="needs oversight" delay="rise-4" />
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        {/* Activity */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="display text-[18px] font-semibold">Daily activity</h2>
          <p className="text-[12px] text-ink-soft">Events · last 14 days</p>
          {totalEvents === 0 ? (
            <div className="mt-5 h-40 grid place-items-center text-[13px] text-ink-soft">
              No activity recorded yet.
            </div>
          ) : (
            <div className="mt-5 flex items-end gap-1.5 h-40">
              {days.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                  <span className="text-[10px] text-ink-soft opacity-0 group-hover:opacity-100 transition-opacity">{v}</span>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-accent/30 to-accent group-hover:to-accent-deep transition-colors"
                    style={{ height: `${(v / peak) * 100}%` }} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Risk distribution */}
        <div className="card p-5">
          <h2 className="display text-[18px] font-semibold mb-4">Risk distribution</h2>
          <div className="space-y-3">
            {byRisk.map(({ r, n }) => (
              <div key={r}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="capitalize text-ink-soft">{r}</span>
                  <span className="font-medium tabular-nums">{n}</span>
                </div>
                <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
                  <div className={`h-full rounded-full ${riskColor[r]}`} style={{ width: `${agents.length ? (n / agents.length) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agents by category */}
      <div className="mt-6 card p-5">
        <h2 className="display text-[18px] font-semibold mb-4">Agents by category</h2>
        {byCategory.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No agents yet.</p>
        ) : (
          <div className="space-y-3">
            {byCategory.map(([cat, n]) => (
              <div key={cat} className="flex items-center gap-3">
                <div className="w-28 text-[13px] text-ink-soft shrink-0">{cat}</div>
                <div className="flex-1 h-7 rounded-lg bg-black/[0.04] overflow-hidden">
                  <div className="h-full rounded-lg bg-gradient-to-r from-accent to-accent-deep flex items-center justify-end pr-2"
                    style={{ width: `${Math.max((n / maxCat) * 100, 8)}%` }}>
                    <span className="text-[11px] font-semibold text-white tabular-nums">{n}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
