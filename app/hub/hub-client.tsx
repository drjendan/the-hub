"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge, RiskTag } from "@/components/ui";
import { connectorLabel } from "@/lib/connectors";
import type { AgentStatus, RiskTier } from "@/lib/supabase/types";

export interface AgentRow {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  category: string | null;
  status: AgentStatus;
  risk: RiskTier;
  current_version: number;
  connectors: string[];
  tags: string[];
  created_at: string;
  owner_id: string | null;
  owner_name: string;
  org_name: string;
  is_mine: boolean;
  can_delete: boolean;
}

const STATUSES: ("All" | AgentStatus)[] = ["All", "published", "in_review", "draft", "blocked"];

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export function HubClient({ agents }: { agents: AgentRow[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [status, setStatus] = useState<"All" | AgentStatus>("All");
  const [creator, setCreator] = useState("All");
  const [company, setCompany] = useState("All");

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(agents.map((a) => a.category ?? "Other")))],
    [agents]
  );
  const creators = useMemo(
    () => ["All", ...Array.from(new Set(agents.map((a) => a.owner_name))).sort()],
    [agents]
  );
  const companies = useMemo(
    () => ["All", ...Array.from(new Set(agents.map((a) => a.org_name))).sort()],
    [agents]
  );
  const multiCompany = companies.length > 2; // more than just "All" + one

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return agents.filter((a) => {
      if (cat !== "All" && (a.category ?? "Other") !== cat) return false;
      if (status !== "All" && a.status !== status) return false;
      if (creator !== "All" && a.owner_name !== creator) return false;
      if (company !== "All" && a.org_name !== company) return false;
      if (!needle) return true;
      const hay = [a.name, a.summary, a.category, ...a.tags, a.owner_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [agents, q, cat, status, creator, company]);

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Catalog</div>
          <h1 className="display text-[30px] font-semibold leading-none">Library</h1>
          <p className="mt-2 text-[14px] text-ink-soft">
            {results.length} of {agents.length} agents · filter by creator, company, category, or status.
          </p>
        </div>
        <Link href="/builder" className="rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper hover:bg-ink-line transition-colors">
          + New agent
        </Link>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search agents…"
            className="w-full rounded-lg border hairline bg-white pl-9 pr-3 py-2.5 outline-none focus:border-accent"
          />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)}
          className="rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
          {categories.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={creator} onChange={(e) => setCreator(e.target.value)}
          className="rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
          {creators.map((c) => <option key={c} value={c}>{c === "All" ? "All creators" : c}</option>)}
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
          <AgentCard key={a.id} agent={a} multiCompany={multiCompany} />
        ))}
      </div>

      {results.length === 0 && (
        <div className="mt-16 text-center text-ink-soft">
          <div className="text-3xl mb-2">⬡</div>
          {agents.length === 0
            ? "No agents yet. Create your first agent in the Builder."
            : "No agents match those filters."}
        </div>
      )}
    </div>
  );
}

function AgentCard({ agent: a, multiCompany }: { agent: AgentRow; multiCompany: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function del() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: a.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErr(data.error || "Could not delete this agent.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setErr("Could not delete this agent.");
      setBusy(false);
    }
  }

  return (
    <div className="card flex flex-col overflow-hidden hover:shadow-lift hover:-translate-y-0.5 transition-all">
      <Link href={`/hub/${a.slug}`} className="block p-5 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-paper text-ink text-sm font-semibold border hairline">
            {a.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
          <StatusBadge status={a.status} />
        </div>
        <h3 className="mt-3 display text-[17px] font-semibold leading-tight">{a.name}</h3>
        <p className="mt-1.5 text-[13px] text-ink-soft leading-snug line-clamp-2">{a.summary}</p>
        {a.connectors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.connectors.slice(0, 3).map((c) => (
              <span key={c} className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] text-ink-soft">{connectorLabel(c)}</span>
            ))}
            {a.connectors.length > 3 && (
              <span className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] text-ink-soft">+{a.connectors.length - 3}</span>
            )}
          </div>
        )}
        <div className="mt-4 border-t hairline pt-3 text-[12px] text-ink-soft">
          <div className="flex items-center justify-between">
            <RiskTag risk={a.risk} />
            <span>{a.category} · v{a.current_version}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="truncate">
              By <span className="text-ink font-medium">{a.owner_name}</span>
              {a.is_mine && <span className="ml-1 text-accent">(you)</span>}
            </span>
            <span className="shrink-0">{fmtDate(a.created_at)}</span>
          </div>
          {multiCompany && <div className="mt-1 truncate">{a.org_name}</div>}
          {a.status === "published" && (
            <div className="mt-2 text-[12px] font-medium text-accent">Run ▷</div>
          )}
        </div>
      </Link>
      {a.can_delete && (
        <div className="border-t hairline px-5 py-2.5">
          {err && <p className="mb-1.5 text-[12px] text-rust">{err}</p>}
          {!confirming ? (
            <button onClick={() => setConfirming(true)} className="text-[12px] text-rust hover:underline">
              Delete agent
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
