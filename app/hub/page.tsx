"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AGENTS } from "@/lib/demo-data";
import { StatusBadge, RiskTag } from "@/components/ui";
import type { AgentStatus } from "@/lib/supabase/types";

const CATEGORIES = ["All", ...Array.from(new Set(AGENTS.map((a) => a.category ?? "Other")))];
const STATUSES: ("All" | AgentStatus)[] = ["All", "published", "in_review", "draft", "blocked"];

export default function HubPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [status, setStatus] = useState<"All" | AgentStatus>("All");

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return AGENTS.filter((a) => {
      if (cat !== "All" && a.category !== cat) return false;
      if (status !== "All" && a.status !== status) return false;
      if (!needle) return true;
      const hay = [a.name, a.summary, a.category, ...a.tags, ...a.capabilities]
        .join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }, [q, cat, status]);

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Catalog</div>
          <h1 className="display text-[30px] font-semibold leading-none">Agent Hub</h1>
          <p className="mt-2 text-[14px] text-ink-soft">
            {results.length} of {AGENTS.length} agents · search by capability, tool, or tag.
          </p>
        </div>
        <Link href="/builder" className="rounded-lg bg-ink px-4 py-2.5 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors">
          + New agent
        </Link>
      </div>

      {/* Controls */}
      <div className="mt-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
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
          {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
        </select>
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
          <Link key={a.id} href={`/hub/${a.slug}`}
            className="card p-5 hover:shadow-lift hover:-translate-y-0.5 transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-bg-2 text-ink text-sm font-semibold border hairline">
                {a.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
              <StatusBadge status={a.status} />
            </div>
            <h3 className="mt-3 display text-[17px] font-semibold leading-tight">{a.name}</h3>
            <p className="mt-1.5 text-[13px] text-ink-soft leading-snug line-clamp-3">{a.summary}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {a.tags.slice(0, 3).map((t) => (
                <span key={t} className="rounded-md bg-black/[0.04] px-2 py-0.5 text-[11px] text-ink-soft">#{t}</span>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between border-t hairline pt-3 text-[12px]">
              <RiskTag risk={a.risk} />
              <span className="text-ink-soft">{a.category} · v{a.current_version}</span>
            </div>
          </Link>
        ))}
      </div>

      {results.length === 0 && (
        <div className="mt-16 text-center text-ink-soft">
          <div className="text-3xl mb-2">⬡</div>
          No agents match those filters.
        </div>
      )}
    </div>
  );
}
