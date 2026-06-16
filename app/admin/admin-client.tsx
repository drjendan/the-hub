"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface AdminMember {
  user_id: string;
  email: string | null;
  full_name: string | null;
  app_role: string;
  org_role: string;
}

export interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  size_band: string | null;
  created_at: string;
  logo_url: string | null;
  members: AdminMember[];
}

const SIZES = ["1-50", "51-200", "201-1000", "1000+"];

export function AdminClient({ orgs }: { orgs: AdminOrg[] }) {
  const router = useRouter();

  // Create-company form
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("51-200");
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function createCompany(e: React.FormEvent) {
    e.preventDefault();
    setCreateErr(null);
    setCreating(true);
    try {
      const res = await fetch("/api/admin/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, industry, size_band: size }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateErr(data.error || "Could not create company.");
        return;
      }
      setName("");
      setIndustry("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Create company */}
      <div className="card p-5">
        <h2 className="display text-[18px] font-semibold mb-4">New company</h2>
        <form onSubmit={createCompany} className="grid sm:grid-cols-4 gap-3 items-end">
          <label className="block sm:col-span-2">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Company name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Acme Corp"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Industry</span>
            <input
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="SaaS"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">Size</span>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent"
            >
              {SIZES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-4">
            {createErr && <p className="mb-2 text-[12px] text-rust">{createErr}</p>}
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-soft disabled:opacity-40 transition-colors"
            >
              {creating ? "Creating…" : "Create company"}
            </button>
          </div>
        </form>
      </div>

      {/* Companies list */}
      {orgs.length === 0 ? (
        <div className="card p-10 text-center text-ink-soft">
          <div className="text-3xl mb-2">⬡</div>
          No companies yet. Create your first tenant above.
        </div>
      ) : (
        orgs.map((org) => <OrgCard key={org.id} org={org} onChanged={() => router.refresh()} />)
      )}
    </div>
  );
}

function LogoUpload({ org, onChanged }: { org: AdminOrg; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("org_id", org.id);
      const res = await fetch("/api/admin/logo", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || "Upload failed.");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/logo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg(data.error || "Could not remove logo.");
        return;
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <label className="cursor-pointer text-[12px] text-accent hover:underline">
        {busy ? "Working…" : org.logo_url ? "Replace logo" : "Upload logo"}
        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={busy} className="hidden" />
      </label>
      {org.logo_url && (
        <button onClick={remove} disabled={busy} className="text-[12px] text-rust hover:underline disabled:opacity-40">
          Remove
        </button>
      )}
      <span className="text-[11px] text-ink-soft/70">PNG/JPEG/WebP · ≤1 MB</span>
      {msg && <span className="text-[12px] text-rust">{msg}</span>}
    </div>
  );
}

function OrgCard({ org, onChanged }: { org: AdminOrg; onChanged: () => void }) {
  const [email, setEmail] = useState("");
  const [orgRole, setOrgRole] = useState("staff");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id, email, org_role: orgRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: "err", text: data.error || "Could not assign user." });
        return;
      }
      setEmail("");
      setMsg({
        tone: "ok",
        text: data.already
          ? "Already a member."
          : data.status === "invited"
          ? "Invited by email and assigned."
          : "User assigned.",
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    try {
      await fetch("/api/admin/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id, user_id: userId }),
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 border-b hairline pb-4">
        <div className="flex items-start gap-3 min-w-0">
          {org.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded company logo
            <img src={org.logo_url} alt="" className="h-12 w-12 shrink-0 rounded-lg border hairline bg-white object-contain" />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border hairline bg-paper text-ink text-sm font-semibold">
              {org.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
            </div>
          )}
          <div className="min-w-0">
            <h3 className="display text-[18px] font-semibold leading-tight">{org.name}</h3>
            <div className="mt-1 text-[12px] text-ink-soft">
              {[org.industry, org.size_band].filter(Boolean).join(" · ") || "—"}
              <span className="mono"> · {org.slug}</span>
            </div>
            <LogoUpload org={org} onChanged={onChanged} />
          </div>
        </div>
        <span className="shrink-0 text-[11px] text-ink-soft">
          {org.members.length} member{org.members.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Members */}
      <div className="mt-4 space-y-2">
        {org.members.length === 0 && (
          <p className="text-[13px] text-ink-soft">No members yet.</p>
        )}
        {org.members.map((m) => (
          <div key={m.user_id} className="flex items-center justify-between gap-3 rounded-lg border hairline px-3 py-2">
            <div className="min-w-0">
              <div className="text-[13px] font-medium truncate">{m.full_name || m.email}</div>
              <div className="text-[12px] text-ink-soft truncate">{m.email}</div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-[11px] uppercase tracking-wide text-ink-soft">
                {m.org_role} · {m.app_role}
              </span>
              <button
                onClick={() => remove(m.user_id)}
                disabled={busy}
                className="text-[12px] text-rust hover:underline disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Assign user */}
      <form onSubmit={assign} className="mt-4 flex flex-col sm:flex-row gap-2 border-t hairline pt-4">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="person@company.com"
          className="flex-1 rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        />
        <select
          value={orgRole}
          onChange={(e) => setOrgRole(e.target.value)}
          className="rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        >
          {["owner", "manager", "staff"].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-white hover:bg-accent-deep disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          {busy ? "Working…" : "Assign / invite"}
        </button>
      </form>
      {msg && (
        <p className={`mt-2 text-[12px] ${msg.tone === "ok" ? "text-moss" : "text-rust"}`}>{msg.text}</p>
      )}
    </div>
  );
}
