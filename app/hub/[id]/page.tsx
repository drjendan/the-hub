import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { googleOAuthConfigured } from "@/lib/google";
import { StatusBadge, RiskTag } from "@/components/ui";
import { connectorLabel } from "@/lib/connectors";
import { AgentRunner } from "./agent-runner";

export const dynamic = "force-dynamic";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export default async function AgentProfile({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: agent } = await supabase
    .from("agents")
    .select("*, owner:profiles(full_name, email), org:organizations(name)")
    .eq("slug", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!agent) notFound();

  const owner = agent.owner as unknown as { full_name: string | null; email: string | null } | null;
  const org = agent.org as unknown as { name: string } | null;
  const ownerName = owner?.full_name || owner?.email || "Unknown";
  const connectors: string[] = Array.isArray(agent.connectors) ? agent.connectors : [];
  const capabilities: string[] = Array.isArray(agent.capabilities) ? agent.capabilities : [];
  const tags: string[] = Array.isArray(agent.tags) ? agent.tags : [];

  const { data: versionRows } = await supabase
    .from("agent_versions")
    .select("version, status, changelog, created_at")
    .eq("agent_id", agent.id)
    .order("version", { ascending: false });
  const versions = versionRows || [];

  // The viewer's own Gmail connection (RLS scopes it to them), for the test-run panel.
  const user = await getUser();
  const { data: conn } = user
    ? await supabase.from("connections").select("id, account_email").eq("provider", "google").maybeSingle()
    : { data: null };
  const oauthConfigured = googleOAuthConfigured();
  const showRunner = oauthConfigured || Boolean(conn);

  return (
    <div className="px-6 sm:px-10 py-8 max-w-5xl mx-auto">
      <Link href="/hub" className="text-[13px] text-accent hover:underline">← Back to Library</Link>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start gap-5 border-b hairline pb-7">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-ink text-paper text-xl font-semibold">
          {agent.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
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
            <span>Created by · <span className="text-ink font-medium">{ownerName}</span></span>
            <span>{fmtDate(agent.created_at)}</span>
            {org && <span>{org.name}</span>}
            <span className="mono">v{agent.current_version}</span>
          </div>
        </div>
        <Link href="/builder"
          className="rounded-lg border hairline bg-white px-4 py-2.5 text-[13px] font-medium hover:bg-black/[0.03] transition-colors">
          New agent
        </Link>
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {showRunner && (
            <AgentRunner
              agentId={agent.id}
              agentSlug={agent.slug}
              oauthConfigured={oauthConfigured}
              connected={Boolean(conn)}
              accountEmail={conn?.account_email ?? null}
              connectionId={conn?.id ?? null}
            />
          )}

          {/* Capabilities */}
          <section className="card p-5">
            <h2 className="display text-[18px] font-semibold mb-3">Capabilities</h2>
            {capabilities.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-2">
                {capabilities.map((c) => (
                  <div key={c} className="flex items-center gap-2 rounded-lg border hairline px-3 py-2 text-[13px]">
                    <span className="text-accent">▸</span> {c}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-soft">No capabilities listed.</p>
            )}
          </section>

          {/* Version history */}
          <section className="card p-5">
            <h2 className="display text-[18px] font-semibold mb-3">Version history</h2>
            <div className="space-y-2">
              {versions.map((ver) => {
                const current = ver.version === agent.current_version;
                return (
                  <div key={ver.version}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                      current ? "border-accent/40 bg-accent/[0.04]" : "hairline"
                    }`}>
                    <span className="mono text-[13px] font-medium">v{ver.version}</span>
                    <span className="text-[13px] text-ink-soft flex-1">
                      {ver.changelog || "—"} · {fmtDate(ver.created_at)}
                    </span>
                    {current && (
                      <span className="text-[11px] font-medium text-accent uppercase tracking-wide">live</span>
                    )}
                  </div>
                );
              })}
              {versions.length === 0 && <p className="text-[13px] text-ink-soft">No versions recorded.</p>}
            </div>
          </section>
        </div>

        {/* Sidebar facts */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-[12px] uppercase tracking-[0.12em] text-ink-soft mb-3">At a glance</h3>
            <dl className="space-y-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-ink-soft">Risk tier</dt><dd className="font-semibold capitalize">{agent.risk}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Status</dt><dd className="font-semibold capitalize">{String(agent.status).replace("_", " ")}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Deployments</dt><dd className="font-semibold tabular-nums">{agent.deployments ?? 0}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-soft">Created by</dt><dd className="font-semibold">{ownerName}</dd></div>
            </dl>
          </div>
          <div className="card p-5">
            <h3 className="text-[12px] uppercase tracking-[0.12em] text-ink-soft mb-3">Connectors</h3>
            {connectors.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {connectors.map((c) => (
                  <span key={c} className="rounded-md border hairline bg-white px-2.5 py-1 text-[12px]">{connectorLabel(c)}</span>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-ink-soft">No connectors configured.</p>
            )}
          </div>
          {tags.length > 0 && (
            <div className="card p-5">
              <h3 className="text-[12px] uppercase tracking-[0.12em] text-ink-soft mb-3">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span key={t} className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[12px] text-ink-soft">#{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
