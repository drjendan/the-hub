import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser, ensureProfile, getOrgsForUser, getCurrentOrgId } from "@/lib/auth";
import { SessionsClient, type SessionRowView } from "./sessions-client";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const user = await getUser();
  if (!user) return null;
  const profile = await ensureProfile(user);
  const orgs = await getOrgsForUser();
  const orgId = await getCurrentOrgId(orgs, profile);

  if (!orgId) {
    return (
      <div className="px-6 sm:px-10 py-8 max-w-5xl mx-auto">
        <div className="card p-10 text-center text-ink-soft mt-6">
          No company selected yet. <Link href="/" className="text-accent hover:underline">Go to the dashboard</Link>.
        </div>
      </div>
    );
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("sessions")
    .select("id, status, started_at, last_active_at, ip_hash, agent:agents(name), user:profiles(full_name, email)")
    .eq("organization_id", orgId)
    .order("started_at", { ascending: false });

  const sessions: SessionRowView[] = (data || []).map((s) => {
    const agent = s.agent as unknown as { name: string } | null;
    const u = s.user as unknown as { full_name: string | null; email: string | null } | null;
    return {
      id: s.id,
      status: s.status,
      agent_name: agent?.name ?? "—",
      user_name: u?.full_name || u?.email || "—",
      ip_hash: s.ip_hash,
      last_active_at: s.last_active_at,
    };
  });

  return <SessionsClient sessions={sessions} />;
}
