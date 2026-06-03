import type { AgentStatus, RiskTier } from "@/lib/supabase/types";

const STATUS_STYLE: Record<AgentStatus, { label: string; cls: string; dot: string }> = {
  published:  { label: "Published",  cls: "bg-moss/10 text-moss border-moss/25",   dot: "bg-moss" },
  in_review:  { label: "In review",  cls: "bg-gold/10 text-gold border-gold/30",   dot: "bg-gold" },
  draft:      { label: "Draft",      cls: "bg-black/[0.04] text-ink-soft border-line", dot: "bg-ink-soft/50" },
  deprecated: { label: "Deprecated", cls: "bg-black/[0.04] text-ink-soft border-line", dot: "bg-ink-soft/40" },
  blocked:    { label: "Blocked",    cls: "bg-rust/10 text-rust border-rust/25",   dot: "bg-rust" },
};

const RISK_STYLE: Record<RiskTier, string> = {
  low:        "text-moss",
  moderate:   "text-gold",
  high:       "text-accent-deep",
  restricted: "text-rust",
};

export function StatusBadge({ status }: { status: AgentStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function RiskTag({ risk }: { risk: RiskTier }) {
  return (
    <span className={`text-[11px] font-medium uppercase tracking-wide ${RISK_STYLE[risk]}`}>
      {risk} risk
    </span>
  );
}

export function PageHeader({
  eyebrow, title, sub, action,
}: { eyebrow?: string; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
      <div>
        {eyebrow && (
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">
            {eyebrow}
          </div>
        )}
        <h1 className="display text-[28px] sm:text-[34px] font-semibold leading-none">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-[14px] text-ink-soft">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label, value, hint, delay = "",
}: { label: string; value: string; hint?: string; delay?: string }) {
  return (
    <div className={`card p-5 rise ${delay}`}>
      <div className="text-[11px] uppercase tracking-[0.12em] text-ink-soft">{label}</div>
      <div className="mt-2 display text-[30px] font-semibold leading-none">{value}</div>
      {hint && <div className="mt-2 text-[12px] text-ink-soft">{hint}</div>}
    </div>
  );
}
