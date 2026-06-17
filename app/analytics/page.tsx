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

  const [{ data: agentRows }, { data: events }, { data: runRows }] = await Promise.all([
    supabase.from("agents").select("id, name, status, risk, category").eq("organization_id", orgId),
    supabase
      .from("analytics_events")
      .select("created_at")
      .eq("organization_id", orgId)
      .gte("created_at", since.toISOString()),
    // agent_runs may not exist yet (agent_runs.sql not run) — resilient to null.
    supabase.from("agent_runs").select("agent_id, confidence, accurate, hallucinated").eq("organization_id", orgId),
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

  // ---- Trust & quality (from agent_runs) ----
  const runs = runRows || [];
  const totalRuns = runs.length;
  const confVals = runs.map((r) => r.confidence).filter((c): c is number => typeof c === "number");
  const avgConfidence = confVals.length ? confVals.reduce((a, b) => a + b, 0) / confVals.length : null;
  const ratedRuns = runs.filter((r) => r.accurate !== null || r.hallucinated !== null);
  const hallucinatedRuns = runs.filter((r) => r.hallucinated === true);
  const hallucinationRate = ratedRuns.length ? hallucinatedRuns.length / ratedRuns.length : null;

  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const byAgent = new Map<string, { runs: number; conf: number[]; rated: number; hall: number }>();
  for (const r of runs) {
    const k = r.agent_id as string;
    const cur = byAgent.get(k) || { runs: 0, conf: [], rated: 0, hall: 0 };
    cur.runs++;
    if (typeof r.confidence === "number") cur.conf.push(r.confidence);
    if (r.accurate !== null || r.hallucinated !== null) cur.rated++;
    if (r.hallucinated === true) cur.hall++;
    byAgent.set(k, cur);
  }
  const agentTrust = [...byAgent.entries()]
    .map(([id, v]) => ({
      name: agentName.get(id) || "Unknown agent",
      runs: v.runs,
      avgConf: v.conf.length ? v.conf.reduce((a, b) => a + b, 0) / v.conf.length : null,
      hallRate: v.rated ? v.hall / v.rated : null,
      rated: v.rated,
    }))
    .sort((a, b) => b.runs - a.runs);

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

      {/* Trust & quality */}
      <div className="mt-6 card p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="display text-[18px] font-semibold">Trust &amp; quality</h2>
          <span className="text-[12px] text-ink-soft">{totalRuns} run{totalRuns === 1 ? "" : "s"} recorded</span>
        </div>
        <p className="text-[12px] text-ink-soft mb-4">
          Confidence is self-reported by the model (a soft signal). Hallucination rate is based on reviewer
          feedback — these help us <span className="font-medium">minimize and monitor</span> hallucinations, not eliminate them.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
          <MiniStat label="Total runs" value={String(totalRuns)} />
          <MiniStat label="Avg confidence" value={avgConfidence !== null ? `${Math.round(avgConfidence * 100)}%` : "—"} />
          <MiniStat label="Hallucination rate" value={hallucinationRate !== null ? `${Math.round(hallucinationRate * 100)}%` : "—"} sub={`${ratedRuns.length} rated`} />
        </div>

        {agentTrust.length === 0 ? (
          <p className="text-[13px] text-ink-soft">
            No runs recorded yet. Run a text agent (and run agent_runs.sql) to start collecting trust signals.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 px-3 text-[11px] uppercase tracking-wide text-ink-soft/70">
              <span className="flex-1">Agent</span>
              <span className="w-14 text-right">Runs</span>
              <span className="w-20 text-right">Avg conf.</span>
              <span className="w-28 text-right">Halluc. rate</span>
            </div>
            {agentTrust.map((a) => (
              <div key={a.name} className="flex items-center gap-3 rounded-lg border hairline px-3 py-2 text-[13px]">
                <span className="flex-1 truncate font-medium">{a.name}</span>
                <span className="w-14 text-right tabular-nums">{a.runs}</span>
                <span className="w-20 text-right tabular-nums">{a.avgConf !== null ? `${Math.round(a.avgConf * 100)}%` : "—"}</span>
                <span className={`w-28 text-right tabular-nums ${a.hallRate !== null && a.hallRate > 0 ? "text-rust" : "text-ink-soft"}`}>
                  {a.hallRate !== null ? `${Math.round(a.hallRate * 100)}% (${a.rated})` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border hairline bg-white p-3">
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink-soft">{label}</div>
      <div className="mt-1 text-[22px] font-semibold leading-none tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-ink-soft">{sub}</div>}
    </div>
  );
}
