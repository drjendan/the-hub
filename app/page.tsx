import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { StatTile, StatusBadge, RiskTag } from "@/components/ui";
import { MissionBanner } from "./mission-banner";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) {
    // Middleware normally prevents this; render nothing rather than crash.
    return null;
  }

  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);

  // No company yet — guide the user based on their role.
  if (!orgId) {
    return (
      <div className="px-6 sm:px-10 py-8 max-w-3xl mx-auto">
        <div className="border-b hairline pb-6">
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Welcome</div>
          <h1 className="display text-[30px] font-semibold leading-none">Let&apos;s get set up</h1>
        </div>
        <div className="mt-6 card p-8 text-center">
          <div className="text-3xl mb-3">⬡</div>
          {profile.app_role === "admin" ? (
            <>
              <p className="text-[14px] text-ink-soft max-w-md mx-auto">
                You don&apos;t have any companies yet. Create your first company (tenant), then
                assign users and start building agents.
              </p>
              <Link href="/admin" className="mt-5 inline-block rounded-lg bg-ink px-5 py-2.5 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors">
                Create a company →
              </Link>
            </>
          ) : (
            <p className="text-[14px] text-ink-soft max-w-md mx-auto">
              You haven&apos;t been added to a company yet. Ask your administrator to assign you
              to one, then refresh this page.
            </p>
          )}
        </div>
      </div>
    );
  }

  const supabase = createClient();
  const [{ data: agentRows }, { count: openGov }, { count: appCount }] = await Promise.all([
    supabase
      .from("agents")
      .select("id, slug, name, status, risk, category, created_at, owner:profiles(full_name, email)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    supabase
      .from("governance_requests")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "open"),
    // Apps count — resilient: returns null (shown as 0) until apps.sql is run.
    supabase
      .from("apps")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId),
  ]);

  const agents = agentRows || [];
  const published = agents.filter((a) => a.status === "published").length;
  const inReview = agents.filter((a) => a.status === "in_review").length;
  const restricted = agents.filter((a) => a.risk === "restricted").length;
  const currentOrg = orgs.find((o) => o.id === orgId);
  const canEditMission = profile.app_role === "admin" || currentOrg?.org_role === "owner";

  // Mission statement — resilient: stays null if mission.sql hasn't been run yet.
  let mission: string | null = null;
  {
    const { data: orgRow, error: missionErr } = await supabase
      .from("organizations")
      .select("mission_statement")
      .eq("id", orgId)
      .maybeSingle();
    if (!missionErr && orgRow) {
      mission = (orgRow as { mission_statement: string | null }).mission_statement ?? null;
    }
  }

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Overview</div>
          <h1 className="display text-[30px] font-semibold leading-none">{currentOrg?.name || "Dashboard"}</h1>
          <p className="mt-2 text-[14px] text-ink-soft">Your agent fleet at a glance.</p>
        </div>
        <Link href="/builder" className="rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors">
          + New agent
        </Link>
      </div>

      <MissionBanner orgId={orgId} initialMission={mission} canEdit={!!canEditMission} />

      <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile label="Total agents" value={String(agents.length)} hint="in this company" delay="rise-1" />
        <StatTile label="Total apps" value={String(appCount ?? 0)} hint="launchable tools" delay="rise-2" />
        <StatTile label="Published" value={String(published)} hint="agents live in catalog" delay="rise-3" />
        <StatTile label="In review" value={String(inReview)} hint="agents awaiting governance" delay="rise-4" />
        <StatTile label="Open requests" value={String(openGov ?? 0)} hint="governance queue" delay="rise-5" />
      </div>

      <div className="mt-6 grid lg:grid-cols-3 gap-6">
        {/* Recent agents */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="display text-[18px] font-semibold">Recent agents</h2>
            <Link href="/hub" className="text-[12px] text-accent hover:underline">View all</Link>
          </div>
          {agents.length === 0 ? (
            <div className="py-10 text-center text-ink-soft text-[14px]">
              No agents yet.{" "}
              <Link href="/builder" className="text-accent hover:underline">Create your first agent</Link>.
            </div>
          ) : (
            <div className="space-y-2">
              {agents.slice(0, 6).map((a) => {
                const owner = a.owner as unknown as { full_name: string | null; email: string | null } | null;
                return (
                  <Link key={a.id} href={`/hub/${a.slug}`}
                    className="flex items-center gap-3 rounded-lg border hairline px-3 py-2.5 hover:bg-black/[0.02] transition-colors">
                    <div className="grid h-9 w-9 place-items-center rounded-lg bg-paper text-ink text-[12px] font-semibold border hairline">
                      {a.name.split(" ").map((w: string) => w[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-medium truncate">{a.name}</div>
                      <div className="text-[12px] text-ink-soft truncate">
                        {a.category} · by {owner?.full_name || owner?.email || "Unknown"}
                      </div>
                    </div>
                    <StatusBadge status={a.status} />
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Risk distribution */}
        <div className="card p-5">
          <h2 className="display text-[18px] font-semibold mb-4">Risk posture</h2>
          <div className="space-y-3">
            {(["low", "moderate", "high", "restricted"] as const).map((r) => {
              const n = agents.filter((a) => a.risk === r).length;
              const color: Record<string, string> = { low: "bg-moss", moderate: "bg-gold", high: "bg-accent", restricted: "bg-rust" };
              return (
                <div key={r}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="capitalize text-ink-soft">{r}</span>
                    <span className="font-medium tabular-nums">{n}</span>
                  </div>
                  <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
                    <div className={`h-full rounded-full ${color[r]}`} style={{ width: `${agents.length ? (n / agents.length) * 100 : 0}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {restricted > 0 && (
            <p className="mt-4 text-[12px] text-rust flex items-center gap-1.5">
              <RiskTag risk="restricted" /> need oversight
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
