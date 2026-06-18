"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AccountRef } from "@/lib/auth";

export interface WorkspaceStat {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  size_band: string | null;
  agents: number;
  apps: number;
  runs: number;
  open_gov: number;
}
export interface TeamMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  assignments: { organization_id: string; org_role: string }[];
}
export interface AccountPolicyRow {
  id: string;
  title: string;
  category: string | null;
  workspace_ids: string[];
}
export interface PackRow {
  id: string;
  key: string;
  name: string;
}

export function PortfolioClient({
  accounts,
  activeAccountId,
  activeAccountName,
  workspaces,
  members,
  policies,
  packs,
  assignedPacks,
}: {
  accounts: AccountRef[];
  activeAccountId: string;
  activeAccountName: string;
  workspaces: WorkspaceStat[];
  members: TeamMember[];
  policies: AccountPolicyRow[];
  packs: PackRow[];
  assignedPacks: { organization_id: string; pack_id: string }[];
}) {
  const router = useRouter();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Portfolio</div>
          <h1 className="display text-[30px] font-semibold leading-none">{activeAccountName}</h1>
          <p className="mt-2 text-[14px] text-ink-soft">
            {workspaces.length} workspace{workspaces.length === 1 ? "" : "s"} in this account.
          </p>
        </div>
        {accounts.length > 1 && (
          <select
            value={activeAccountId}
            onChange={(e) => router.push(`/portfolio?account=${e.target.value}`)}
            className="rounded-lg border hairline bg-white px-3 py-2 text-[13px] outline-none focus:border-accent"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <Workspaces accountId={activeAccountId} workspaces={workspaces} onChanged={() => router.refresh()} />
      <People
        workspaces={workspaces}
        members={members}
        onChanged={() => router.refresh()}
      />
      <Governance
        accountId={activeAccountId}
        workspaces={workspaces}
        policies={policies}
        packs={packs}
        assignedPacks={assignedPacks}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

/* ------------------------------- Workspaces ------------------------------- */
function Workspaces({
  accountId,
  workspaces,
  onChanged,
}: {
  accountId: string;
  workspaces: WorkspaceStat[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/portfolio/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not create workspace.");
        return;
      }
      setName("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="display text-[18px] font-semibold mb-3">Workspaces</h2>
      {workspaces.length === 0 ? (
        <div className="card p-8 text-center text-ink-soft text-[14px]">
          No workspaces yet. A holding account can run with none — or add the first one below.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {workspaces.map((w) => (
            <Link key={w.id} href={`/portfolio/${w.id}`} className="card p-4 hover:bg-black/[0.02] transition-colors">
              <div className="font-semibold text-ink truncate">{w.name}</div>
              <div className="text-[12px] text-ink-soft">
                {[w.industry, w.size_band].filter(Boolean).join(" · ") || "—"}
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Metric label="Agents" value={w.agents} />
                <Metric label="Apps" value={w.apps} />
                <Metric label="Runs" value={w.runs} />
                <Metric label="Gov" value={w.open_gov} highlight={w.open_gov > 0} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New workspace name"
          className="flex-1 min-w-[200px] rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-line disabled:opacity-40 transition-colors"
        >
          {busy ? "Adding…" : "Add workspace"}
        </button>
        {err && <p className="w-full text-[12px] text-rust">{err}</p>}
      </form>
    </section>
  );
}

function Metric({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <div className={`text-[16px] font-semibold tabular-nums ${highlight ? "text-rust" : "text-ink"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-ink-soft">{label}</div>
    </div>
  );
}

/* --------------------------------- People --------------------------------- */
function People({
  workspaces,
  members,
  onChanged,
}: {
  workspaces: WorkspaceStat[];
  members: TeamMember[];
  onChanged: () => void;
}) {
  const [email, setEmail] = useState("");
  const [wsId, setWsId] = useState(workspaces[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function setAssignment(organization_id: string, member: TeamMember, assigned: boolean) {
    if (assigned) {
      // Unassign by user_id.
      await fetch("/api/portfolio/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id, user_id: member.user_id }),
      });
    } else {
      // Assign an existing member by their email (no invite — they already exist).
      if (!member.email) return;
      await fetch("/api/portfolio/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id, email: member.email }),
      });
    }
    onChanged();
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!wsId) return;
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/portfolio/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: wsId, email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: "err", text: data.error || "Could not assign." });
        return;
      }
      setEmail("");
      setMsg({ tone: "ok", text: data.status === "invited" ? "Invited and assigned." : "Assigned." });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  if (workspaces.length === 0) return null;

  return (
    <section>
      <h2 className="display text-[18px] font-semibold mb-1">People</h2>
      <p className="mb-3 text-[12px] text-ink-soft">
        Assign team members to specific workspaces. A member sees only the workspaces they&apos;re checked into.
      </p>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft/80 border-b hairline">
              <th className="px-4 py-2.5 font-medium">Member</th>
              {workspaces.map((w) => (
                <th key={w.id} className="px-3 py-2.5 font-medium text-center whitespace-nowrap">{w.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={workspaces.length + 1} className="px-4 py-6 text-center text-ink-soft">
                  No team members assigned yet. Invite someone below.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.user_id} className="border-b hairline last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium truncate">{m.full_name || m.email}</div>
                    <div className="text-[12px] text-ink-soft truncate">{m.email}</div>
                  </td>
                  {workspaces.map((w) => {
                    const assigned = m.assignments.some((a) => a.organization_id === w.id);
                    return (
                      <td key={w.id} className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={assigned}
                          onChange={() => setAssignment(w.id, m, assigned)}
                          className="h-4 w-4 accent-[color:var(--accent)] cursor-pointer"
                          aria-label={`${m.full_name || m.email} in ${w.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <form onSubmit={invite} className="mt-3 flex flex-wrap items-end gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@company.com"
          className="flex-1 min-w-[200px] rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        />
        <select
          value={wsId}
          onChange={(e) => setWsId(e.target.value)}
          className="rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-white hover:bg-accent-deep disabled:opacity-40 transition-colors"
        >
          {busy ? "Working…" : "Invite to workspace"}
        </button>
        {msg && <p className={`w-full text-[12px] ${msg.tone === "ok" ? "text-moss" : "text-rust"}`}>{msg.text}</p>}
      </form>
    </section>
  );
}

/* ------------------------------- Governance ------------------------------- */
function Governance({
  accountId,
  workspaces,
  policies,
  packs,
  assignedPacks,
  onChanged,
}: {
  accountId: string;
  workspaces: WorkspaceStat[];
  policies: AccountPolicyRow[];
  packs: PackRow[];
  assignedPacks: { organization_id: string; pack_id: string }[];
  onChanged: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function toggleMapping(policy_id: string, organization_id: string, currentlyApplied: boolean) {
    await fetch("/api/portfolio/policies", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy_id, organization_id, apply: !currentlyApplied }),
    });
    onChanged();
  }

  async function togglePack(organization_id: string, pack_id: string, enabled: boolean) {
    await fetch("/api/portfolio/compliance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organization_id, pack_id, enabled: !enabled }),
    });
    onChanged();
  }

  async function createPolicy(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/portfolio/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, title, category, body }),
      });
      if (res.ok) {
        setTitle("");
        setCategory("");
        setBody("");
        onChanged();
      }
    } finally {
      setBusy(false);
    }
  }

  async function deletePolicy(policy_id: string) {
    await fetch("/api/portfolio/policies", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy_id }),
    });
    onChanged();
  }

  const isPackOn = (organization_id: string, pack_id: string) =>
    assignedPacks.some((a) => a.organization_id === organization_id && a.pack_id === pack_id);

  if (workspaces.length === 0) return null;

  return (
    <section>
      <h2 className="display text-[18px] font-semibold mb-1">Governance</h2>
      <p className="mb-3 text-[12px] text-ink-soft">
        Account policies and compliance packs apply only to the workspaces you check — all, several, or one.
      </p>

      {/* Account policies → workspace mapping */}
      <div className="card p-5">
        <h3 className="text-[14px] font-semibold mb-3">Account policies</h3>
        {policies.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No account policies yet. Create one below to assign it across workspaces.</p>
        ) : (
          <div className="space-y-4">
            {policies.map((p) => (
              <div key={p.id} className="border-b hairline pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-[14px] font-medium">{p.title}</span>
                    {p.category && <span className="ml-2 text-[11px] text-ink-soft">{p.category}</span>}
                  </div>
                  <button onClick={() => deletePolicy(p.id)} className="text-[12px] text-rust hover:underline">
                    Delete
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {workspaces.map((w) => {
                    const on = p.workspace_ids.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        onClick={() => toggleMapping(p.id, w.id, on)}
                        className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                          on ? "border-accent bg-accent/[0.08] text-accent-deep" : "hairline bg-white text-ink-soft hover:border-ink-soft"
                        }`}
                      >
                        {on ? "✓ " : ""}{w.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={createPolicy} className="mt-4 border-t hairline pt-4 grid sm:grid-cols-3 gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Policy title"
            className="sm:col-span-2 rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
          />
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)"
            className="rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Policy text (optional)"
            rows={2}
            className="sm:col-span-3 rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent resize-y"
          />
          <div className="sm:col-span-3">
            <button
              type="submit"
              disabled={busy || !title.trim()}
              className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-line disabled:opacity-40 transition-colors"
            >
              {busy ? "Creating…" : "Create account policy"}
            </button>
          </div>
        </form>
      </div>

      {/* Compliance packs → per workspace */}
      <div className="card p-5 mt-4">
        <h3 className="text-[14px] font-semibold mb-3">Compliance packs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft/80 border-b hairline">
                <th className="px-2 py-2 font-medium">Pack</th>
                {workspaces.map((w) => (
                  <th key={w.id} className="px-3 py-2 font-medium text-center whitespace-nowrap">{w.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {packs.map((pk) => (
                <tr key={pk.id} className="border-b hairline last:border-0">
                  <td className="px-2 py-2 font-medium whitespace-nowrap">{pk.name}</td>
                  {workspaces.map((w) => {
                    const on = isPackOn(w.id, pk.id);
                    return (
                      <td key={w.id} className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => togglePack(w.id, pk.id, on)}
                          className="h-4 w-4 accent-[color:var(--accent)] cursor-pointer"
                          aria-label={`${pk.name} for ${w.name}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
