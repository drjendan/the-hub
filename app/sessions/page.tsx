"use client";

import { useState } from "react";
import { AGENTS } from "@/lib/demo-data";

type Sess = {
  id: string; agent: string; user: string; status: "active" | "closed" | "revoked";
  started: string; lastActive: string; ipHash: string; messages: number;
};

const INITIAL: Sess[] = [
  { id: "e0000000…0002", agent: "Support Triage Agent", user: "Sam Cho", status: "active", started: "40m ago", lastActive: "2m ago", ipHash: "sha256:3b2c", messages: 8 },
  { id: "e0000000…0001", agent: "HR Policy Q&A", user: "Sam Cho", status: "closed", started: "3d ago", lastActive: "3d ago", ipHash: "sha256:9af1", messages: 2 },
  { id: "e0000000…0003", agent: "Invoice Triage Agent", user: "Marcus Bell", status: "active", started: "12m ago", lastActive: "just now", ipHash: "sha256:1d77", messages: 5 },
];

export default function SessionsPage() {
  const [sessions, setSessions] = useState(INITIAL);
  const active = sessions.filter((s) => s.status === "active").length;

  const revoke = (id: string) =>
    setSessions((ss) => ss.map((s) => (s.id === id ? { ...s, status: "revoked" as const } : s)));

  return (
    <div className="px-6 sm:px-10 py-8 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Runtime</div>
          <h1 className="display text-[30px] font-semibold leading-none">Secure sessions</h1>
          <p className="mt-2 text-[14px] text-ink-soft">{active} active · scoped to your org, RLS-enforced.</p>
        </div>
      </div>

      {/* Security posture strip */}
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

      {/* Table */}
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
            <div className="col-span-3 font-medium truncate">{s.agent}</div>
            <div className="col-span-2 text-ink-soft">{s.user}</div>
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
            <div className="col-span-2 text-ink-soft">{s.lastActive}</div>
            <div className="col-span-2 mono text-[12px] text-ink-soft truncate">{s.ipHash}</div>
            <div className="col-span-1 text-right">
              {s.status === "active" ? (
                <button onClick={() => revoke(s.id)} className="text-[12px] text-rust hover:underline">Revoke</button>
              ) : (
                <span className="text-[12px] text-ink-soft/50">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
