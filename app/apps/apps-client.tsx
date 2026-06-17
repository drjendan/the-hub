"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui";
import type { AgentStatus } from "@/lib/supabase/types";

// App status reuses the agent_status values, so AgentStatus types the badge.
export interface AppRow {
  id: string;
  name: string;
  url: string;
  description: string | null; // "what it does"
  category: string | null;
  status: AgentStatus; // governance status
  created_at: string;
  primary_users: string | null;
  key_features: string | null;
  data_inputs: string | null;
  status_label: string | null; // operational/maturity, descriptive only
  product_owner: string | null;
  organization_id: string;
  owner_name: string;
  org_name: string;
  org_logo_url: string | null;
  can_manage: boolean;
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
const STATUS_LABEL_SUGGESTIONS = ["Live", "Demo", "Live demo", "Live demo (Vercel)", "Live (production)", "Beta", "Planned", "Internal"];

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

  const owners = useMemo(() => ["All", ...Array.from(new Set(apps.map((a) => a.owner_name))).sort()], [apps]);
  const companies = useMemo(() => ["All", ...orgs.map((o) => o.name)], [orgs]);
  const multiCompany = orgs.length > 1;

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return apps.filter((a) => {
      if (owner !== "All" && a.owner_name !== owner) return false;
      if (company !== "All" && a.org_name !== company) return false;
      if (status !== "All" && a.status !== status) return false;
      if (!needle) return true;
      const hay = [a.name, a.description, a.category, a.primary_users, a.key_features, a.data_inputs, a.status_label, a.owner_name]
        .filter(Boolean).join(" ").toLowerCase();
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
            {results.length} of {apps.length} apps · compare what each does, who it serves, features, data, and status.
          </p>
        </div>
        {canCreate && (
          <button onClick={() => setShowForm((s) => !s)}
            className="rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper hover:bg-ink-line transition-colors">
            {showForm ? "Close" : "+ Register app"}
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <div className="mt-6">
          <AppForm orgs={orgs} membersByOrg={membersByOrg} currentUserId={currentUserId} currentOrgId={currentOrgId}
            onDone={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {/* Controls */}
      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps…"
            className="w-full rounded-lg border hairline bg-white pl-9 pr-3 py-2.5 outline-none focus:border-accent" />
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

      {/* Comparison grid — 2-up so profiles sit side by side */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {results.map((a) => (
          <AppCard key={a.id} app={a} orgs={orgs} membersByOrg={membersByOrg}
            currentUserId={currentUserId} multiCompany={multiCompany} />
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

function ProfileField({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-2.5">
      <div className="text-[10px] uppercase tracking-[0.1em] text-ink-soft/70">{label}</div>
      <div className="mt-0.5 text-[13px] text-ink-soft leading-snug whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function AppCard({
  app: a, orgs, membersByOrg, currentUserId, multiCompany,
}: {
  app: AppRow;
  orgs: Org[];
  membersByOrg: Record<string, Member[]>;
  currentUserId: string;
  multiCompany: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
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

  if (editing) {
    return (
      <AppForm app={a} orgs={orgs} membersByOrg={membersByOrg} currentUserId={currentUserId} currentOrgId={a.organization_id}
        onDone={() => { setEditing(false); router.refresh(); }} onCancel={() => setEditing(false)} />
    );
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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <h3 className="display text-[17px] font-semibold leading-tight">{a.name}</h3>
        {a.status_label && (
          <span className="rounded-full border hairline bg-black/[0.02] px-2 py-0.5 text-[11px] font-medium text-ink-soft">{a.status_label}</span>
        )}
      </div>

      <ProfileField label="What it does" value={a.description} />
      <ProfileField label="Primary users" value={a.primary_users} />
      <ProfileField label="Key features" value={a.key_features} />
      <ProfileField label="Data inputs" value={a.data_inputs} />

      <div className="mt-4 border-t hairline pt-3 text-[12px] text-ink-soft">
        <div className="flex items-center justify-between">
          <span className="truncate">Owner <span className="text-ink font-medium">{a.owner_name}</span></span>
          <span className="shrink-0">{a.category || "—"}</span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          {multiCompany ? <span className="truncate">{a.org_name}</span> : <span />}
          <span className="shrink-0">{fmtDate(a.created_at)}</span>
        </div>
      </div>

      <div className="mt-4">
        {a.status === "published" ? (
          <a href={a.url} target="_blank" rel="noopener noreferrer"
            className="block w-full rounded-lg bg-accent px-4 py-2 text-center text-[13px] font-medium text-white hover:bg-accent-deep transition-colors">
            Launch ↗
          </a>
        ) : (
          <div className="rounded-lg border hairline bg-black/[0.02] px-4 py-2 text-center text-[12px] text-ink-soft">
            {a.status === "blocked" ? "Blocked in review" : "Awaiting approval to launch"}
          </div>
        )}
      </div>

      {a.can_manage && (
        <div className="mt-3 border-t hairline pt-3 flex flex-wrap items-center gap-3 text-[12px]">
          {err && <p className="text-rust">{err}</p>}
          <button onClick={() => setEditing(true)} className="text-accent hover:underline">Edit</button>
          {!confirming ? (
            <button onClick={() => setConfirming(true)} className="text-rust hover:underline">Delete</button>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-ink-soft">Delete?</span>
              <button onClick={del} disabled={busy} className="font-medium text-rust hover:underline disabled:opacity-40">{busy ? "…" : "Yes"}</button>
              <button onClick={() => setConfirming(false)} disabled={busy} className="text-ink-soft hover:text-ink">No</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function AppForm({
  orgs, membersByOrg, currentUserId, currentOrgId, app, onDone, onCancel,
}: {
  orgs: Org[];
  membersByOrg: Record<string, Member[]>;
  currentUserId: string;
  currentOrgId: string;
  app?: AppRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const dlId = useId();
  const isEdit = !!app;
  const defaultOrg = isEdit ? app!.organization_id : orgs.some((o) => o.id === currentOrgId) ? currentOrgId : orgs[0]?.id || "";
  const ownerFor = (oid: string) => {
    const m = membersByOrg[oid] || [];
    if (m.some((x) => x.id === currentUserId)) return currentUserId;
    return m[0]?.id || currentUserId;
  };

  const [orgIdSel, setOrgIdSel] = useState(defaultOrg);
  const effectiveOrg = isEdit ? app!.organization_id : orgIdSel;
  const [name, setName] = useState(app?.name ?? "");
  const [url, setUrl] = useState(app?.url ?? "");
  const [description, setDescription] = useState(app?.description ?? "");
  const [primaryUsers, setPrimaryUsers] = useState(app?.primary_users ?? "");
  const [keyFeatures, setKeyFeatures] = useState(app?.key_features ?? "");
  const [dataInputs, setDataInputs] = useState(app?.data_inputs ?? "");
  const [statusLabel, setStatusLabel] = useState(app?.status_label ?? "");
  const [category, setCategory] = useState(app?.category ?? "");
  const [productOwner, setProductOwner] = useState(app?.product_owner ?? ownerFor(effectiveOrg));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const members = membersByOrg[effectiveOrg] || [];
  function changeOrg(next: string) {
    setOrgIdSel(next);
    setProductOwner(ownerFor(next));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const payload = {
        name, url,
        description: description || undefined,
        category: category || undefined,
        product_owner: productOwner,
        primary_users: primaryUsers || undefined,
        key_features: keyFeatures || undefined,
        data_inputs: dataInputs || undefined,
        status_label: statusLabel || undefined,
      };
      const res = await fetch("/api/apps", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEdit ? { id: app!.id, ...payload } : { organization_id: orgIdSel, ...payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not save the app.");
        return;
      }
      router.refresh();
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const lbl = "mb-1.5 block text-[12px] font-medium text-ink-soft";
  const inp = "w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent";

  return (
    <div className="card p-5">
      <h2 className="display text-[18px] font-semibold mb-1">{isEdit ? "Edit app" : "Register an app"}</h2>
      <p className="text-[12px] text-ink-soft mb-4">
        {isEdit
          ? "Update this app's profile. Governance status and launchability are unchanged."
          : "Submitted for governance review before it can launch."}
      </p>
      <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={lbl}>Company</span>
          {isEdit ? (
            <div className="w-full rounded-lg border hairline bg-black/[0.03] px-3 py-2.5 text-[14px] text-ink-soft">
              {orgs.find((o) => o.id === effectiveOrg)?.name || "—"}
            </div>
          ) : (
            <select value={orgIdSel} onChange={(e) => changeOrg(e.target.value)} className={inp}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </label>
        <label className="block">
          <span className={lbl}>Product owner</span>
          <select value={productOwner} onChange={(e) => setProductOwner(e.target.value)} className={inp}>
            {members.length === 0 && <option value={currentUserId}>You</option>}
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={lbl}>App name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="LV Lead Financials" className={inp} />
        </label>
        <label className="block">
          <span className={lbl}>Launch URL</span>
          <input value={url} onChange={(e) => setUrl(e.target.value)} required type="url" placeholder="https://…" className={inp} />
        </label>
        <label className="block">
          <span className={lbl}>Status label</span>
          <input value={statusLabel} onChange={(e) => setStatusLabel(e.target.value)} list={dlId}
            placeholder="Live demo (Vercel)" className={inp} />
          <datalist id={dlId}>
            {STATUS_LABEL_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </label>
        <label className="block">
          <span className={lbl}>Category (optional)</span>
          <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Finance, Intelligence…" className={inp} />
        </label>
        <label className="block sm:col-span-2">
          <span className={lbl}>What it does</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
            placeholder="A full paragraph describing what this app does." className={`${inp} resize-y`} />
        </label>
        <label className="block sm:col-span-2">
          <span className={lbl}>Primary users</span>
          <input value={primaryUsers} onChange={(e) => setPrimaryUsers(e.target.value)}
            placeholder="Who the app serves — e.g. finance team, portfolio CFOs." className={inp} />
        </label>
        <label className="block sm:col-span-2">
          <span className={lbl}>Key features</span>
          <textarea value={keyFeatures} onChange={(e) => setKeyFeatures(e.target.value)} rows={2}
            placeholder="Main features — a few sentences or a simple list." className={`${inp} resize-y`} />
        </label>
        <label className="block sm:col-span-2">
          <span className={lbl}>Data inputs</span>
          <input value={dataInputs} onChange={(e) => setDataInputs(e.target.value)}
            placeholder="What data/inputs it uses — e.g. QuickBooks exports, LeadHoop CSVs." className={inp} />
        </label>
        <div className="sm:col-span-2 flex items-center gap-3">
          {err && <p className="text-[12px] text-rust">{err}</p>}
          <button type="submit" disabled={busy || !name.trim() || !url.trim()}
            className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-line disabled:opacity-40 transition-colors">
            {busy ? "Saving…" : isEdit ? "Save changes" : "Submit for approval"}
          </button>
          <button type="button" onClick={onCancel} disabled={busy} className="text-[13px] text-ink-soft hover:text-ink disabled:opacity-40">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
