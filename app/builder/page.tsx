"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge, RiskTag } from "@/components/ui";
import { CONNECTORS, connectorLabel } from "@/lib/connectors";
import type { RiskTier } from "@/lib/supabase/types";

interface ProviderInfo {
  provider: "openai" | "anthropic" | "google";
  label: string;
  model: string;
  configured: boolean;
}

interface Suggestion {
  name: string;
  summary: string;
  category: string;
  capabilities: string[];
  tools: string[];
  system_prompt: string;
  risk: RiskTier;
  risk_rationale: string;
}

export default function BuilderPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Finance");
  const [summary, setSummary] = useState("");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [temp, setTemp] = useState(0.3);
  const [risk, setRisk] = useState<RiskTier>("low");
  const [connectors, setConnectors] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // AI assist
  const [brief, setBrief] = useState("");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/suggest-agent")
      .then((r) => r.json())
      .then((d) => {
        setProviders(d.providers || []);
        setActive(d.active || null);
      })
      .catch(() => {});
  }, []);

  const requiresReview = risk === "high" || risk === "restricted";
  const toggleConnector = (key: string) =>
    setConnectors((arr) => (arr.includes(key) ? arr.filter((x) => x !== key) : [...arr, key]));

  async function suggestWithAI() {
    setAiError(null);
    setAiNote(null);
    setAiLoading(true);
    try {
      const res = await fetch("/api/suggest-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, role: category, goal: brief || summary }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || "Suggestion failed.");
        return;
      }
      const s: Suggestion = data.suggestion;
      if (s.name && !name.trim()) setName(s.name);
      if (s.category) setCategory(matchCategory(s.category));
      if (s.summary) setSummary(s.summary);
      if (s.system_prompt) setPrompt(s.system_prompt);
      if (s.risk) setRisk(s.risk);
      if (Array.isArray(s.capabilities)) setCapabilities(s.capabilities);
      if (Array.isArray(s.tools)) {
        const keys = s.tools.map(matchConnector).filter(Boolean) as string[];
        setConnectors(Array.from(new Set(keys)));
      }
      const providerLabel =
        providers.find((p) => p.provider === data.source)?.label || data.source;
      setAiNote(`Drafted by ${providerLabel}. ${s.risk_rationale || ""}`.trim());
    } catch {
      setAiError("Could not reach the suggestion service.");
    } finally {
      setAiLoading(false);
    }
  }

  async function save() {
    setSaveErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          category,
          summary,
          system_prompt: prompt,
          model,
          temperature: temp,
          risk,
          connectors,
          capabilities,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveErr(data.error || "Could not save the agent.");
        return;
      }
      router.push(`/hub/${data.slug}`);
      router.refresh();
    } catch {
      setSaveErr("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  const noProvider = providers.length > 0 && !active;

  return (
    <div className="px-6 sm:px-10 py-8 max-w-6xl mx-auto">
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Builder</div>
        <h1 className="display text-[30px] font-semibold leading-none">Create an agent</h1>
        <p className="mt-2 max-w-xl text-[14px] text-ink-soft">
          Define behavior, model, and connectors — or let AI draft a starting point. High-risk
          agents route to the governance queue instead of publishing directly.
        </p>
      </div>

      {/* AI assist bar */}
      <div className="mt-6 card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-accent font-semibold">Suggest with AI</div>
          <span className="text-[11px] mono text-ink-soft">
            {active
              ? `Connected · ${providers.find((p) => p.provider === active)?.label}`
              : "No provider connected"}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Describe the job in plain language, e.g. 'screen inbound resumes and flag top 5 for recruiters'"
            className="flex-1 rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
          />
          <button
            onClick={suggestWithAI}
            disabled={aiLoading || noProvider || (!brief.trim() && !name.trim() && !summary.trim())}
            className="rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-white hover:bg-accent-deep disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {aiLoading ? "Drafting…" : "Draft with AI"}
          </button>
        </div>
        {noProvider && (
          <p className="mt-2 text-[12px] text-rust">
            No AI provider is configured. Add an OpenAI, Anthropic, or Google API key to the
            environment to enable suggestions.
          </p>
        )}
        {aiError && <p className="mt-2 text-[12px] text-rust">{aiError}</p>}
        {aiNote && <p className="mt-2 text-[12px] text-moss">{aiNote}</p>}
      </div>

      <div className="mt-6 grid lg:grid-cols-5 gap-6">
        {/* Editor */}
        <div className="lg:col-span-3 card p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Agent name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Invoice Triage Agent"
                className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
            </Field>
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
                {["Finance", "Support", "People Ops", "Legal", "Sales", "Operations", "Research"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Summary">
            <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What does this agent do?"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
          </Field>

          <Field label="System prompt">
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={6}
              placeholder="You are an AP assistant. Cite PO numbers and never approve payment…"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent resize-none mono text-[13px]" />
          </Field>

          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Model">
              <select value={model} onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
                {["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label={`Temperature · ${temp.toFixed(1)}`}>
              <input type="range" min={0} max={1} step={0.1} value={temp}
                onChange={(e) => setTemp(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
            </Field>
            <Field label="Risk tier">
              <select value={risk} onChange={(e) => setRisk(e.target.value as RiskTier)}
                className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
                {(["low", "moderate", "high", "restricted"] as RiskTier[]).map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Connectors">
            <div className="flex flex-wrap gap-2">
              {CONNECTORS.map((c) => (
                <button key={c.key} type="button" onClick={() => toggleConnector(c.key)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
                    connectors.includes(c.key) ? "border-accent bg-accent/[0.08] text-accent-deep" : "hairline bg-white text-ink-soft hover:border-ink-soft"
                  }`}>
                  {c.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-soft">
              Connectors are stored with the agent. Actual execution is wired up later.
            </p>
          </Field>
        </div>

        {/* Live preview + action */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-5">
            <div className="text-[11px] uppercase tracking-[0.12em] text-ink-soft mb-3">Live preview</div>
            <div className="flex items-start justify-between gap-2">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-ink text-paper text-sm font-semibold">
                {(name || "New Agent").split(" ").map((w) => w[0]).slice(0, 2).join("")}
              </div>
              <StatusBadge status={requiresReview ? "in_review" : "draft"} />
            </div>
            <h3 className="mt-3 display text-[17px] font-semibold leading-tight">{name || "New agent"}</h3>
            <p className="mt-1 text-[13px] text-ink-soft">{summary || "No summary yet."}</p>
            <div className="mt-3 flex items-center justify-between border-t hairline pt-3 text-[12px]">
              <RiskTag risk={risk} />
              <span className="text-ink-soft mono">{model} · {temp.toFixed(1)}</span>
            </div>
            {connectors.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {connectors.map((c) => <span key={c} className="rounded-md border hairline px-2 py-0.5 text-[11px]">{connectorLabel(c)}</span>)}
              </div>
            )}
          </div>

          <div className={`rounded-xl border p-4 text-[13px] ${requiresReview ? "border-gold/40 bg-gold/[0.06]" : "hairline bg-white"}`}>
            {requiresReview ? (
              <><strong className="text-gold">Routes to governance.</strong> {risk} risk agents require a reviewer decision before they can be published.</>
            ) : (
              <><strong className="text-moss">Direct publish allowed.</strong> Low/moderate risk agents publish without review under standard governance.</>
            )}
          </div>

          {saveErr && <p className="text-[12px] text-rust">{saveErr}</p>}

          <button onClick={save} disabled={saving || !name.trim()}
            className="w-full rounded-lg bg-ink py-2.5 text-[14px] font-medium text-paper hover:bg-ink-soft disabled:opacity-40 transition-colors">
            {saving ? "Saving…" : requiresReview ? "Submit for review" : "Save & publish"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

// Map a free-text category from the model onto the closest dropdown option.
function matchCategory(c: string): string {
  const opts = ["Finance", "Support", "People Ops", "Legal", "Sales", "Operations", "Research"];
  const lc = c.toLowerCase();
  if (lc.includes("hr") || lc.includes("people") || lc.includes("recruit")) return "People Ops";
  return opts.find((o) => o.toLowerCase() === lc) || opts.find((o) => lc.includes(o.toLowerCase())) || "Operations";
}

// Map a suggested tool/integration name onto a known connector key.
function matchConnector(t: string): string {
  const lc = t.toLowerCase();
  const hit = CONNECTORS.find(
    (c) => c.label.toLowerCase() === lc || lc.includes(c.label.toLowerCase()) || lc.includes(c.key.replace(/_/g, " "))
  );
  return hit?.key || "";
}
