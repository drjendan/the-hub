"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionStatus } from "@/lib/supabase/types";

export interface SessionRowView {
  id: string;
  status: SessionStatus;
  agent_name: string;
  user_name: string;
  ip_hash: string | null;
  last_active_at: string;
}

function fmt(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function SessionsClient({ sessions }: { sessions: SessionRowView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const active = sessions.filter((s) => s.status === "active").length;

  async function revoke(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/sessions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-6 sm:px-10 py-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Runtime</div>
          <h1 className="display text-[30px] font-semibold leading-none">Secure sessions</h1>
          <p className="mt-2 text-[14px] text-ink-soft">{active} active · scoped to your company, RLS-enforced.</p>
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        {[
          ["No raw IPs stored", "Only salted hashes are persisted."],
          ["Per-session scope", "RLS limits visibility to the owner & reviewers."],
          ["Revocable", "Any session can be terminated immediately."],
        ].map(([t, d]) => (
          <div key={t} className="card p-4">
            <div className="text-[13px] font-semibold flex items-center gap-2"><span className="text-moss">●</span>{t}</div>
            <div className="mt-1 text-[12px] text-ink-soft">{d}</div>
          </div>
        ))}
      </div>

      {sessions.length === 0 ? (
        <div className="mt-5 card p-10 text-center text-ink-soft">
          <div className="text-3xl mb-2">❖</div>
          No sessions yet. Sessions appear here once agents are run (agent execution is coming
          in a later phase).
        </div>
      ) : (
        <div className="mt-5 card overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-5 py-3 text-[11px] uppercase tracking-wide text-ink-soft border-b hairline">
            <div className="col-span-3">Agent</div>
            <div className="col-span-2">User</div>
            <div className="col-span-2">Status</div>
            <div className="col-span-2">Last active</div>
            <div className="col-span-2 mono">IP hash</div>
            <div className="col-span-1 text-right">Action</div>
          </div>
          {sessions.map((s) => (
            <div key={s.id} className="grid grid-cols-12 gap-2 items-center px-5 py-3.5 border-b hairline last:border-0 text-[13px]">
              <div className="col-span-3 font-medium truncate">{s.agent_name}</div>
              <div className="col-span-2 text-ink-soft truncate">{s.user_name}</div>
              <div className="col-span-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  s.status === "active" ? "bg-moss/10 text-moss" :
                  s.status === "revoked" ? "bg-rust/10 text-rust" : "bg-black/[0.05] text-ink-soft"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    s.status === "active" ? "bg-moss" : s.status === "revoked" ? "bg-rust" : "bg-ink-soft/50"
                  }`} />
                  {s.status}
                </span>
              </div>
              <div className="col-span-2 text-ink-soft">{fmt(s.last_active_at)}</div>
              <div className="col-span-2 mono text-[12px] text-ink-soft truncate">{s.ip_hash || "—"}</div>
              <div className="col-span-1 text-right">
                {s.status === "active" ? (
                  <button onClick={() => revoke(s.id)} disabled={busy === s.id}
                    className="text-[12px] text-rust hover:underline disabled:opacity-40">Revoke</button>
                ) : (
                  <span className="text-[12px] text-ink-soft/50">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
