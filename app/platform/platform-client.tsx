"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  account_id: string | null;
  industry: string | null;
  size_band: string | null;
  created_at: string;
  users: number;
  apps: number;
  agents: number;
  byok: boolean;
}
export interface AccountGroup {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  admins: number;
  workspaces: TenantRow[];
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PlatformClient({ groups, unassigned }: { groups: AccountGroup[]; unassigned: TenantRow[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="mt-6 space-y-6">
      <CreateAccount onChanged={refresh} />

      {groups.length === 0 && unassigned.length === 0 ? (
        <div className="card p-10 text-center text-ink-soft">
          <div className="text-3xl mb-2">⬡</div>
          No accounts yet. Create your first account above.
        </div>
      ) : (
        groups.map((g) => <AccountCard key={g.id} group={g} onChanged={refresh} />)
      )}

      {unassigned.length > 0 && (
        <div className="card p-5">
          <h2 className="display text-[16px] font-semibold mb-1">Unassigned workspaces</h2>
          <p className="mb-3 text-[12px] text-ink-soft">
            Legacy workspaces with no parent account. Recreate them under an account, or leave them as-is.
          </p>
          <WorkspaceTable rows={unassigned} />
        </div>
      )}
    </div>
  );
}

function CreateAccount({ onChanged }: { onChanged: () => void }) {
  const [name, setName] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/platform/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          first_workspace_name: workspace || undefined,
          owner_email: ownerEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) {
        setMsg({ tone: "err", text: data.error || "Could not create account." });
        return;
      }
      setMsg(
        data.owner_error
          ? { tone: "err", text: data.owner_error }
          : { tone: "ok", text: `Account “${name}” created.` }
      );
      setName("");
      setWorkspace("");
      setOwnerEmail("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <h2 className="display text-[18px] font-semibold mb-1">New account</h2>
      <p className="mb-4 text-[12px] text-ink-soft">
        A holding company can start with no workspace. Add a first workspace and/or an account owner now,
        or later.
      </p>
      <form onSubmit={submit} className="grid sm:grid-cols-3 gap-3 items-end">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Account name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Lead Ventures"
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">First workspace <span className="text-ink-soft/60">(optional)</span></span>
          <input value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="leave blank for a pure holding co."
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Account owner email <span className="text-ink-soft/60">(optional)</span></span>
          <input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="sean@leadventures.com"
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
        </label>
        <div className="sm:col-span-3">
          {msg && <p className={`mb-2 text-[12px] ${msg.tone === "ok" ? "text-moss" : "text-rust"}`}>{msg.text}</p>}
          <button type="submit" disabled={busy || !name.trim()}
            className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-line disabled:opacity-40 transition-colors">
            {busy ? "Creating…" : "Create account"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AccountCard({ group, onChanged }: { group: AccountGroup; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function addWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/platform/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: group.id, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not add workspace.");
        return;
      }
      setName("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 border-b hairline pb-4">
        <div>
          <h2 className="display text-[18px] font-semibold leading-tight">{group.name}</h2>
          <div className="mt-1 text-[12px] text-ink-soft">
            <span className="mono">{group.slug}</span> · {group.workspaces.length} workspace
            {group.workspaces.length === 1 ? "" : "s"} · {group.admins} account admin{group.admins === 1 ? "" : "s"} ·
            created {fmtDate(group.created_at)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {group.workspaces.length === 0 ? (
          <p className="text-[13px] text-ink-soft">No workspaces — a pure holding account. Add one below.</p>
        ) : (
          <WorkspaceTable rows={group.workspaces} />
        )}
      </div>

      <form onSubmit={addWorkspace} className="mt-4 flex flex-wrap items-end gap-2 border-t hairline pt-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add a workspace to this account"
          className="flex-1 min-w-[200px] rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent" />
        <button type="submit" disabled={busy || !name.trim()}
          className="rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-white hover:bg-accent-deep disabled:opacity-40 transition-colors">
          {busy ? "Adding…" : "Add workspace"}
        </button>
        {err && <p className="w-full text-[12px] text-rust">{err}</p>}
      </form>
    </div>
  );
}

function WorkspaceTable({ rows }: { rows: TenantRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft/80 border-b hairline">
            <th className="px-2 py-2 font-medium">Workspace</th>
            <th className="px-3 py-2 font-medium text-right">Users</th>
            <th className="px-3 py-2 font-medium text-right">Apps</th>
            <th className="px-3 py-2 font-medium text-right">Agents</th>
            <th className="px-3 py-2 font-medium">BYOK</th>
            <th className="px-3 py-2 font-medium">Created</th>
            <th className="px-2 py-2 font-medium text-right"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className="border-b hairline last:border-0 hover:bg-black/[0.02] transition-colors">
              <td className="px-2 py-2.5">
                <div className="font-medium text-ink">{t.name}</div>
                <div className="text-[12px] text-ink-soft">
                  {[t.industry, t.size_band].filter(Boolean).join(" · ") || "—"}
                  <span className="mono"> · {t.slug}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{t.users}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{t.apps}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{t.agents}</td>
              <td className="px-3 py-2.5">
                {t.byok ? (
                  <span className="rounded-full bg-moss/12 px-2 py-0.5 text-[11px] font-semibold text-moss">✓ Key set</span>
                ) : (
                  <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-ink-soft">Platform key</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-ink-soft whitespace-nowrap">{fmtDate(t.created_at)}</td>
              <td className="px-2 py-2.5 text-right">
                <Link href={`/platform/${t.id}`} className="text-[12px] text-accent hover:underline whitespace-nowrap">View →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
