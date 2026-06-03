"use client";

import { useState } from "react";
import Link from "next/link";
import { ROLES } from "@/lib/demo-data";
import type { AgentMatch } from "@/lib/supabase/types";

const STARTERS = ROLES;

export default function RoleMatchPage() {
  const [title, setTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [tools, setTools] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<AgentMatch[] | null>(null);
  const [source, setSource] = useState<string>("");

  function loadStarter(id: string) {
    const r = STARTERS.find((s) => s.id === id);
    if (!r) return;
    setTitle(r.title);
    setDepartment(r.department ?? "");
    setResponsibilities(r.responsibilities.join("\n"));
    setTools(r.tools_used.join(", "));
    setMatches(null);
  }

  async function run() {
    setLoading(true);
    setMatches(null);
    try {
      const res = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          department,
          responsibilities: responsibilities.split("\n").map((s) => s.trim()).filter(Boolean),
          tools: tools.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      setMatches(data.matches ?? []);
      setSource(data.source ?? "heuristic");
    } catch {
      setMatches([]);
      setSource("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-6 sm:px-10 py-8 max-w-5xl mx-auto">
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Recommendation flow</div>
        <h1 className="display text-[30px] font-semibold leading-none">Match a role to agents</h1>
        <p className="mt-2 max-w-xl text-[14px] text-ink-soft">
          Describe a role and its responsibilities. The engine ranks catalog agents
          by fit and explains each match.
        </p>
      </div>

      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="card p-5">
          <div className="mb-4">
            <div className="text-[12px] text-ink-soft mb-1.5">Start from a saved role</div>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((r) => (
                <button key={r.id} onClick={() => loadStarter(r.id)}
                  className="rounded-full border hairline bg-white px-3 py-1 text-[12px] hover:border-accent hover:text-accent transition-colors">
                  {r.title}
                </button>
              ))}
            </div>
          </div>

          <Field label="Role title">
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Accounts Payable Specialist"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
          </Field>
          <Field label="Department">
            <input value={department} onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Finance"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
          </Field>
          <Field label="Responsibilities (one per line)">
            <textarea value={responsibilities} onChange={(e) => setResponsibilities(e.target.value)}
              rows={5} placeholder={"Invoice intake & coding\n3-way PO matching\nException triage"}
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent resize-none" />
          </Field>
          <Field label="Tools used (comma separated)">
            <input value={tools} onChange={(e) => setTools(e.target.value)}
              placeholder="NetSuite, Outlook, Excel"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
          </Field>

          <button onClick={run} disabled={loading || !title.trim()}
            className="mt-2 w-full rounded-lg bg-ink py-2.5 text-[14px] font-medium text-paper hover:bg-ink-soft disabled:opacity-40 transition-colors">
            {loading ? "Scoring catalog…" : "Recommend agents →"}
          </button>
        </div>

        {/* Results */}
        <div className="space-y-3">
          {!matches && !loading && (
            <div className="card p-8 text-center text-ink-soft">
              <div className="text-3xl mb-2">⊹</div>
              Results will appear here, ranked by fit.
            </div>
          )}
          {loading && (
            <div className="card p-8 text-center text-ink-soft animate-pulse">Analyzing role profile…</div>
          )}
          {matches && matches.length > 0 && (
            <>
              <div className="flex items-center justify-between text-[12px] text-ink-soft px-1">
                <span>{matches.length} recommended</span>
                <span className="rounded-full bg-black/[0.04] px-2 py-0.5">
                  source: {source === "openai" ? "OpenAI" : "heuristic"}
                </span>
              </div>
              {matches.map((m, i) => (
                <div key={m.agent_id + i} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-paper text-[12px] font-semibold">{i + 1}</span>
                      <span className="text-[15px] font-semibold">{m.agent_name}</span>
                    </div>
                    <ScorePill score={m.match_score} />
                  </div>
                  <p className="mt-2 text-[13px] text-ink-soft leading-snug">{m.rationale}</p>
                </div>
              ))}
            </>
          )}
          {matches && matches.length === 0 && (
            <div className="card p-8 text-center text-ink-soft">No strong matches in the catalog yet.</div>
          )}
        </div>
      </div>

      <p className="mt-6 text-[12px] text-ink-soft">
        Need a different intake?{" "}
        <Link href="/intake/corporate" className="text-accent hover:underline">Corporate intake</Link>.
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-3">
      <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function ScorePill({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const tone = pct >= 80 ? "bg-moss/12 text-moss" : pct >= 55 ? "bg-gold/12 text-gold" : "bg-black/[0.05] text-ink-soft";
  return <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold tabular-nums ${tone}`}>{pct}% fit</span>;
}
