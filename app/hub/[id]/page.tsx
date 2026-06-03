import Link from "next/link";
import { notFound } from "next/navigation";
import { AGENTS } from "@/lib/demo-data";
import { StatusBadge, RiskTag } from "@/components/ui";

export function generateStaticParams() {
  return AGENTS.map((a) => ({ id: a.slug }));
}

export default function AgentProfile({ params }: { params: { id: string } }) {
  const agent = AGENTS.find((a) => a.slug === params.id);
  if (!agent) notFound();

  // Synthetic version history for the profile view
  const versions = Array.from({ length: agent.current_version }, (_, i) => {
    const v = agent.current_version - i;
    return {
      v,
      current: v === agent.current_version,
      note:
        v === agent.current_version
          ? "Current published version"
          : `Superseded by v${v + 1}`,
    };
  });

  return (
    <div className="px-6 sm:px-10 py-8 max-w-5xl mx-auto">
      <Link href="/hub" className="text-[13px] text-accent hover:underline">← Back to Hub</Link>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start gap-5 border-b hairline pb-7">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-ink text-paper text-xl font-semibold">
          {agent.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
        </div>
        <div className="flex-1 min-w-[240px]">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="display text-[30px] font-semibold leading-none">{agent.name}</h1>
            <StatusBadge status={agent.status} />
          </div>
          <p className="mt-2 max-w-2xl text-[14px] text-ink-soft">{agent.summary}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-ink-soft">
            <span>{agent.category}</span>
            <RiskTag risk={agent.risk} />
            <span>Owner · {agent.owner_name}</span>
            <span className="mono">v{agent.current_version}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/sessions"
            className="rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors">
            Start session
          </Link>
          <Link href="/builder"
            className="rounded-lg border hairline bg-white px-4 py-2.5 text-[13px] font-medium hover:bg-black/[0.03] transition-colors">
            Edit
          </Link>
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Capabilities */}
          <section className="card p-5">
            <h2 className="display text-[18px] font-semibold mb-3">Capabilities</h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {agent.capabilities.map((c) => (
                <div key={c} className="flex items-center gap-2 rounded-lg border hairline px-3 py-2 text-[13px]">
                  <span className="text-accent">▸</span> {c}
                </div>
              ))}
            </div>
          </section>

          {/* Version history */}
          <section className="card p-5">
            <h2 className="display text-[18px] font-semibold mb-3">Version history</h2>
            <div className="space-y-2">
              {versions.map((ver) => (
                <div key={ver.v}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                    ver.current ? "border-accent/40 bg-accent/[0.04]" : "hairline"
                  }`}>
                  <span className="mono text-[13px] font-medium">v{ver.v}</span>
                  <span className="text-[13px] text-ink-soft flex-1">{ver.note}</span>
                  {ver.current && (
                    <span className="text-[11px] font-medium text-accent uppercase tracking-wide">live</span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Sidebar facts */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-[12px] uppercase tracking-[0.12em] text-ink-soft mb-3">At a glance</h3>
            <dl className="space-y-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-soft">Deployments</dt><dd className="font-semibold tabular-nums">{agent.deployments}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Avg. rating</dt><dd className="font-semibold tabular-nums">{agent.avg_rating || "—"}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Risk tier</dt><dd className="font-semibold capitalize">{agent.risk}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Status</dt><dd className="font-semibold capitalize">{agent.status.replace("_", " ")}</dd></div>
            </dl>
          </div>
          <div className="card p-5">
            <h3 className="text-[12px] uppercase tracking-[0.12em] text-ink-soft mb-3">Connected tools</h3>
            <div className="flex flex-wrap gap-1.5">
              {agent.tools.map((t) => (
                <span key={t} className="rounded-md border hairline bg-white px-2.5 py-1 text-[12px]">{t}</span>
              ))}
            </div>
          </div>
          <div className="card p-5">
            <h3 className="text-[12px] uppercase tracking-[0.12em] text-ink-soft mb-3">Tags</h3>
            <div className="flex flex-wrap gap-1.5">
              {agent.tags.map((t) => (
                <span key={t} className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[12px] text-ink-soft">#{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
