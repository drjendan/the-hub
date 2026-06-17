"use client";

import { useState } from "react";

const GOALS = ["Reduce manual back-office work", "Standardize vendor comms", "Faster customer support", "Improve compliance reporting", "Accelerate hiring", "Sales research at scale"];
const COMPLIANCE = ["SOC 2", "GDPR", "HIPAA", "FERPA", "ISO 27001"];

export default function CorporateIntake() {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [size, setSize] = useState("201-1000");
  const [sensitivity, setSensitivity] = useState("moderate");
  const [goals, setGoals] = useState<string[]>([]);
  const [compliance, setCompliance] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function submit() {
    setErr(null);
    setSaving(true);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake_type: "corporate",
          name,
          industry,
          size_band: size,
          data_sensitivity: sensitivity,
          primary_goals: goals,
          compliance,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not save. Are you part of a company?");
        return;
      }
      setDone(true);
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="px-6 sm:px-10 py-8 max-w-3xl mx-auto">
        <div className="card p-8 text-center rise">
          <div className="text-4xl mb-3 text-moss">✓</div>
          <h1 className="display text-[26px] font-semibold">Intake received</h1>
          <p className="mt-2 text-ink-soft text-[14px]">
            Profile saved for {name || "your company"}. Next, match a role to agents.
          </p>
          <a href="/intake/role" className="mt-5 inline-block rounded-lg bg-ink px-5 py-2.5 text-[13px] font-medium text-paper hover:bg-ink-line transition-colors">
            Match a role →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 sm:px-10 py-8 max-w-3xl mx-auto">
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Setup</div>
        <h1 className="display text-[30px] font-semibold leading-none">Corporate Intake</h1>
        <p className="mt-2 text-[14px] text-ink-soft">
          Record your company profile, goals, and compliance needs. This is saved against your
          current company to inform governance posture. (Companies themselves are created by your
          provider admin.)
        </p>
      </div>

      <div className="mt-6 card p-6 space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Organization name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
          </Field>
          <Field label="Industry">
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Manufacturing & Logistics"
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent" />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company size">
            <select value={size} onChange={(e) => setSize(e.target.value)}
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
              {["1-50", "51-200", "201-1000", "1000+"].map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Data sensitivity → governance mode">
            <select value={sensitivity} onChange={(e) => setSensitivity(e.target.value)}
              className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent">
              <option value="low">Low — standard governance</option>
              <option value="moderate">Moderate — standard governance</option>
              <option value="high">High — strict governance</option>
            </select>
          </Field>
        </div>

        <Field label="Primary goals">
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <Chip key={g} active={goals.includes(g)} onClick={() => toggle(goals, setGoals, g)}>{g}</Chip>
            ))}
          </div>
        </Field>

        <Field label="Compliance requirements">
          <div className="flex flex-wrap gap-2">
            {COMPLIANCE.map((c) => (
              <Chip key={c} active={compliance.includes(c)} onClick={() => toggle(compliance, setCompliance, c)}>{c}</Chip>
            ))}
          </div>
        </Field>

        <div className="rounded-xl bg-bg-2 border hairline p-3 text-[12px] text-ink-soft">
          Governance mode will be set to{" "}
          <strong className="text-ink">{sensitivity === "high" ? "strict" : "standard"}</strong>.
          {sensitivity === "high" && " High-risk agents will require reviewer approval before publish."}
        </div>

        {err && <p className="text-[12px] text-rust">{err}</p>}

        <button onClick={submit} disabled={saving || !name.trim()}
          className="w-full rounded-lg bg-ink py-2.5 text-[14px] font-medium text-paper hover:bg-ink-line disabled:opacity-40 transition-colors">
          {saving ? "Saving…" : "Save company profile"}
        </button>
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
function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors ${
        active ? "border-accent bg-accent/[0.08] text-accent-deep" : "hairline bg-white text-ink-soft hover:border-ink-soft"
      }`}>
      {children}
    </button>
  );
}
