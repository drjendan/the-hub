"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  size_band: string | null;
  created_at: string;
  users: number;
  apps: number;
  agents: number;
  byok: boolean;
}

const SIZES = ["1-50", "51-200", "201-1000", "1000+"];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function PlatformClient({ tenants }: { tenants: TenantRow[] }) {
  const router = useRouter();

  // Create-tenant form
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("51-200");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setCreating(true);
    try {
      const res = await fetch("/api/platform/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          industry,
          size_band: size,
          owner_email: ownerEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 207) {
        setMsg({ tone: "err", text: data.error || "Could not create tenant." });
        return;
      }
      if (data.owner_error) {
        setMsg({ tone: "err", text: data.owner_error });
      } else {
        const seeded =
          data.owner_status === "invited"
            ? " Owner invited by email."
            : data.owner_status === "assigned"
            ? " Owner assigned."
            : "";
        setMsg({ tone: "ok", text: `Tenant “${name}” created.${seeded}` });
      }
      setName("");
      setIndustry("");
      setOwnerEmail("");
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {/* Create tenant */}
      <div className="card p-5">
        <h2 className="display text-[18px] font-semibold mb-1">New tenant</h2>
        <p className="mb-4 text-[12px] text-ink-soft">
          Leave the owner blank to spin up an empty demo tenant, or set an owner email to onboard a
          real client with their first owner.
        </p>
        <form onSubmit={createTenant} className="grid sm:grid-cols-4 gap-3 items-end">
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
          <label className="block sm:col-span-3">
            <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">
              Owner email <span className="text-ink-soft/60">(optional)</span>
            </span>
            <input
              type="email"
              value={ownerEmail}
              onChange={(e) => setOwnerEmail(e.target.value)}
              placeholder="owner@client.com — blank for an empty demo tenant"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent"
            />
          </label>
          <div className="sm:col-span-1 flex items-end">
            <button
              type="submit"
              disabled={creating || !name.trim()}
              className="w-full rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-line disabled:opacity-40 transition-colors"
            >
              {creating ? "Creating…" : "Create tenant"}
            </button>
          </div>
          {msg && (
            <p className={`sm:col-span-4 text-[12px] ${msg.tone === "ok" ? "text-moss" : "text-rust"}`}>
              {msg.text}
            </p>
          )}
        </form>
      </div>

      {/* Tenants table */}
      {tenants.length === 0 ? (
        <div className="card p-10 text-center text-ink-soft">
          <div className="text-3xl mb-2">⬡</div>
          No tenants yet. Create your first company above.
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b hairline">
            <h2 className="display text-[16px] font-semibold">
              {tenants.length} tenant{tenants.length === 1 ? "" : "s"}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-soft/80 border-b hairline">
                  <th className="px-5 py-2.5 font-medium">Company</th>
                  <th className="px-3 py-2.5 font-medium text-right tabular-nums">Users</th>
                  <th className="px-3 py-2.5 font-medium text-right tabular-nums">Apps</th>
                  <th className="px-3 py-2.5 font-medium text-right tabular-nums">Agents</th>
                  <th className="px-3 py-2.5 font-medium">BYOK</th>
                  <th className="px-3 py-2.5 font-medium">Created</th>
                  <th className="px-5 py-2.5 font-medium text-right"></th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b hairline last:border-0 hover:bg-black/[0.02] transition-colors">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink">{t.name}</div>
                      <div className="text-[12px] text-ink-soft">
                        {[t.industry, t.size_band].filter(Boolean).join(" · ") || "—"}
                        <span className="mono"> · {t.slug}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{t.users}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{t.apps}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{t.agents}</td>
                    <td className="px-3 py-3">
                      {t.byok ? (
                        <span className="rounded-full bg-moss/12 px-2 py-0.5 text-[11px] font-semibold text-moss">
                          ✓ Key set
                        </span>
                      ) : (
                        <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] text-ink-soft">
                          Platform key
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-ink-soft whitespace-nowrap">{fmtDate(t.created_at)}</td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/platform/${t.id}`} className="text-[12px] text-accent hover:underline whitespace-nowrap">
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
