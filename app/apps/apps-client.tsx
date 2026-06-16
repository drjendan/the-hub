"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui";
import type { AgentStatus } from "@/lib/supabase/types";

// App status reuses the agent_status values, so AgentStatus types the badge.
export interface AppRow {
  id: string;
  name: string;
  url: string;
  description: string | null;
  category: string | null;
  status: AgentStatus;
  created_at: string;
  owner_name: string;
  org_name: string;
  org_logo_url: string | null;
  can_delete: boolean;
}

export interface Member {
  id: string;
  name: string;
}

export interface Org {
  id: string;
  name: string;
  logo_url: string | null;
}

const STATUSES: ("All" | AgentStatus)[] = ["All", "published", "in_review", "blocked"];

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function AppsClient({
  apps,
  orgs,
  membersByOrg,
  canCreate,
  currentUserId,
  currentOrgId,
}: {
  apps: AppRow[];
  orgs: Org[];
  membersByOrg: Record<string, Member[]>;
  canCreate: boolean;
  currentUserId: string;
  currentOrgId: string;
}) {
  const [q, setQ] = useState("");
  const [owner, setOwner] = useState("All");
  const [company, setCompany] = useState("All");
  const [status, setStatus] = useState<"All" | AgentStatus>("All");
  const [showForm, setShowForm] = useState(false);

  const owners = useMemo(
    () => ["All", ...Array.from(new Set(apps.map((a) => a.owner_name))).sort()],
    [apps]
  );
  // Company filter is built from the user's companies, so it's available even
  // before any apps exist in a given company.
  const companies = useMemo(() => ["All", ...orgs.map((o) => o.name)], [orgs]);
  const multiCompany = orgs.length > 1;

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return apps.filter((a) => {
      if (owner !== "All" && a.owner_name !== owner) return false;
      if (company !== "All" && a.org_name !== company) return false;
      if (status !== "All" && a.status !== status) return false;
      if (!needle) return true;
      const hay = [a.name, a.description, a.category, a.owner_name].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [apps, q, owner, company, status]);

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Catalog</div>
          <h1 className="display text-[30px] font-semibold leading-none">Apps</h1>
          <p className="mt-2 text-[14px] text-ink-soft">
            {results.length} of {apps.length} apps · launchable links to existing tools, governed like agents.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors"
          >
            {showForm ? "Close" : "+ Register app"}
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <RegisterForm
          orgs={orgs}
          membersByOrg={membersByOrg}
          currentUserId={currentUserId}
          currentOrgId={currentOrgId}
          onDone={() => setShowForm(false)}
        />
      )}

      {/* Controls */}
      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search apps…"
            className="w-full rounded-lg border hairline bg-white pl-9 pr-3 py-2.5 outline-none focus:border-accent"
          />
        </div>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}
          className="rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
          {owners.map((o) => <option key={o} value={o}>{o === "All" ? "All owners" : o}</option>)}
        </select>
        {multiCompany && (
          <select value={company} onChange={(e) => setCompany(e.target.value)}
            className="rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
            {companies.map((c) => <option key={c} value={c}>{c === "All" ? "All companies" : c}</option>)}
          </select>
        )}
        <div className="flex gap-1 rounded-lg border hairline bg-white p-1">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`rounded-md px-3 py-1.5 text-[12px] capitalize transition-colors ${
                status === s ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}>
              {s === "in_review" ? "in review" : s}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="mt-6 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {results.map((a) => (
          <AppCard key={a.id} app={a} multiCompany={multiCompany} />
        ))}
      </div>

      {results.length === 0 && (
        <div className="mt-16 text-center text-ink-soft">
          <div className="text-3xl mb-2">▦</div>
          {apps.length === 0
            ? "No apps yet. Register your first tool above — it goes through governance before it can launch."
            : "No apps match those filters."}
        </div>
      )}
    </div>
  );
}

function AppCard({ app: a, multiCompany }: { app: AppRow; multiCompany: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/apps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErr(data.error || "Could not delete this app.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setErr("Could not delete this app.");
      setBusy(false);
    }
  }

  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        {a.org_logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded company logo
          <img src={a.org_logo_url} alt="" className="h-11 w-11 rounded-xl border hairline bg-white object-contain" />
        ) : (
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-paper text-ink text-sm font-semibold border hairline">
            {a.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
        )}
        <StatusBadge status={a.status} />
      </div>
      <h3 className="mt-3 display text-[17px] font-semibold leading-tight">{a.name}</h3>
      <p className="mt-1.5 text-[13px] text-ink-soft leading-snug line-clamp-2">{a.description || "—"}</p>
      <div className="mt-4 border-t hairline pt-3 text-[12px] text-ink-soft">
        <div className="flex items-center justify-between">
          <span className="truncate">
            Owner <span className="text-ink font-medium">{a.owner_name}</span>
          </span>
          <span className="shrink-0">{a.category || "—"}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          {multiCompany ? <span className="truncate">{a.org_name}</span> : <span />}
          <span className="shrink-0">{fmtDate(a.created_at)}</span>
        </div>
      </div>
      <div className="mt-4">
        {a.status === "published" ? (
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-lg bg-accent px-4 py-2 text-center text-[13px] font-medium text-white hover:bg-accent-deep transition-colors"
          >
            Launch ↗
          </a>
        ) : (
          <div className="rounded-lg border hairline bg-black/[0.02] px-4 py-2 text-center text-[12px] text-ink-soft">
            {a.status === "blocked" ? "Blocked in review" : "Awaiting approval to launch"}
          </div>
        )}
      </div>
      {a.can_delete && (
        <div className="mt-3 border-t hairline pt-3">
          {err && <p className="mb-2 text-[12px] text-rust">{err}</p>}
          {!confirming ? (
            <button onClick={() => setConfirming(true)} className="text-[12px] text-rust hover:underline">
              Delete app
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-ink-soft">Delete permanently?</span>
              <button onClick={del} disabled={busy}
                className="text-[12px] font-medium text-rust hover:underline disabled:opacity-40">
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
              <button onClick={() => setConfirming(false)} disabled={busy}
                className="text-[12px] text-ink-soft hover:text-ink disabled:opacity-40">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RegisterForm({
  orgs,
  membersByOrg,
  currentUserId,
  currentOrgId,
  onDone,
}: {
  orgs: Org[];
  membersByOrg: Record<string, Member[]>;
  currentUserId: string;
  currentOrgId: string;
  onDone: () => void;
}) {
  const router = useRouter();

  const defaultOrg = orgs.some((o) => o.id === currentOrgId) ? currentOrgId : orgs[0]?.id || "";
  const ownerFor = (orgId: string) => {
    const members = membersByOrg[orgId] || [];
    if (members.some((m) => m.id === currentUserId)) return currentUserId;
    return members[0]?.id || currentUserId;
  };

  const [orgIdSel, setOrgIdSel] = useState(defaultOrg);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [productOwner, setProductOwner] = useState(ownerFor(defaultOrg));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const members = membersByOrg[orgIdSel] || [];

  function changeOrg(next: string) {
    setOrgIdSel(next);
    setProductOwner(ownerFor(next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: orgIdSel,
          name,
          url,
          category: category || undefined,
          description: description || undefined,
          product_owner: productOwner,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not register the app.");
        return;
      }
      setName(""); setUrl(""); setCategory(""); setDescription("");
      router.refresh();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 card p-5">
      <h2 className="display text-[18px] font-semibold mb-1">Register an app</h2>
      <p className="text-[12px] text-ink-soft mb-4">Submitted for governance review before it can launch.</p>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Company</span>
          <select value={orgIdSel} onChange={(e) => changeOrg(e.target.value)}
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Product owner</span>
          <select value={productOwner} onChange={(e) => setProductOwner(e.target.value)}
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
            {members.length === 0 && <option value={currentUserId}>You</option>}
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">App name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="LV Lead Financials"
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Launch URL</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} required type="url" placeholder="https://…"
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Category (optional)</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Finance, Intelligence…"
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Description (optional)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
            placeholder="What this tool does and who uses it."
            className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent resize-none" />
        </label>
        <div className="sm:col-span-2">
          {err && <p className="mb-2 text-[12px] text-rust">{err}</p>}
          <button type="submit" disabled={busy || !name.trim() || !url.trim()}
            className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-soft disabled:opacity-40 transition-colors">
            {busy ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      </form>
    </div>
  );
}
