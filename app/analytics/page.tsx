import { AGENTS, ACTIVITY_14D } from "@/lib/demo-data";
import { StatTile } from "@/components/ui";

export default function AnalyticsPage() {
  const totalDeploys = AGENTS.reduce((s, a) => s + a.deployments, 0);
  const byCategory = Object.entries(
    AGENTS.reduce<Record<string, number>>((acc, a) => {
      const c = a.category ?? "Other";
      acc[c] = (acc[c] ?? 0) + a.deployments;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(...byCategory.map(([, v]) => v), 1);
  const peak = Math.max(...ACTIVITY_14D);

  const byRisk = (["low", "moderate", "high", "restricted"] as const).map((r) => ({
    r, n: AGENTS.filter((a) => a.risk === r).length,
  }));
  const riskColor: Record<string, string> = { low: "bg-moss", moderate: "bg-gold", high: "bg-accent", restricted: "bg-rust" };

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Insights</div>
        <h1 className="display text-[30px] font-semibold leading-none">Analytics</h1>
        <p className="mt-2 text-[14px] text-ink-soft">Usage, adoption, and risk posture across the catalog.</p>
      </div>

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total deployments" value={String(totalDeploys)} hint="all agents" delay="rise-1" />
        <StatTile label="Active agents" value={String(AGENTS.filter((a) => a.status === "published").length)} hint="published" delay="rise-2" />
        <StatTile label="Sessions (14d)" value={String(ACTIVITY_14D.reduce((a, b) => a + b, 0))} hint="rolling window" delay="rise-3" />
        <StatTile label="Restricted agents" value={String(AGENTS.filter((a) => a.risk === "restricted").length)} hint="needs oversight" delay="rise-4" />
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        {/* Activity */}
        <div className="lg:col-span-2 card p-5">
          <h2 className="display text-[18px] font-semibold">Daily activity</h2>
          <p className="text-[12px] text-ink-soft">Sessions & messages · last 14 days</p>
          <div className="mt-5 flex items-end gap-1.5 h-40">
            {ACTIVITY_14D.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <span className="text-[10px] text-ink-soft opacity-0 group-hover:opacity-100 transition-opacity">{v}</span>
                <div className="w-full rounded-t-md bg-gradient-to-t from-accent/30 to-accent group-hover:to-accent-deep transition-colors"
                  style={{ height: `${(v / peak) * 100}%` }} />
              </div>
            ))}
          </div>
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
                  <div className={`h-full rounded-full ${riskColor[r]}`} style={{ width: `${(n / AGENTS.length) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Deployments by category */}
      <div className="mt-6 card p-5">
        <h2 className="display text-[18px] font-semibold mb-4">Deployments by category</h2>
        <div className="space-y-3">
          {byCategory.map(([cat, n]) => (
            <div key={cat} className="flex items-center gap-3">
              <div className="w-28 text-[13px] text-ink-soft shrink-0">{cat}</div>
              <div className="flex-1 h-7 rounded-lg bg-black/[0.04] overflow-hidden">
                <div className="h-full rounded-lg bg-gradient-to-r from-accent to-accent-deep flex items-center justify-end pr-2"
                  style={{ width: `${Math.max((n / maxCat) * 100, 6)}%` }}>
                  <span className="text-[11px] font-semibold text-white tabular-nums">{n}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
