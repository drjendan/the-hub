"use client";

import { useState } from "react";
import { GOVERNANCE } from "@/lib/demo-data";
import { RiskTag } from "@/components/ui";
import type { RequestStatus } from "@/lib/supabase/types";

type Item = (typeof GOVERNANCE)[number] & { note?: string };

export default function GovernancePage() {
  const [items, setItems] = useState<Item[]>(GOVERNANCE);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const decide = (id: string, decision: RequestStatus, note: string) =>
    setItems((arr) =>
      arr.map((it) => (it.id === id ? { ...it, status: decision, resolved_at: new Date().toISOString(), note } : it))
    );

  const shown = items.filter((i) => (filter === "open" ? i.status === "open" : true));
  const openCount = items.filter((i) => i.status === "open").length;

  return (
    <div className="px-6 sm:px-10 py-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b hairline pb-6">
        <div>
          <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Human-in-the-loop</div>
          <h1 className="display text-[30px] font-semibold leading-none">Governance queue</h1>
          <p className="mt-2 text-[14px] text-ink-soft">{openCount} open · reviewer & admin roles can decide.</p>
        </div>
        <div className="flex gap-1 rounded-lg border hairline bg-white p-1">
          {(["open", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-[12px] capitalize transition-colors ${
                filter === f ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
              }`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {shown.map((it) => (
          <RequestCard key={it.id} item={it} onDecide={decide} />
        ))}
        {shown.length === 0 && (
          <div className="card p-10 text-center text-ink-soft">
            <div className="text-3xl mb-2 text-moss">✓</div>
            Queue is clear. No open requests.
          </div>
        )}
      </div>
    </div>
  );
}

function RequestCard({
  item, onDecide,
}: { item: Item; onDecide: (id: string, d: RequestStatus, note: string) => void }) {
  const [note, setNote] = useState("");
  const resolved = item.status !== "open";

  const badge =
    item.status === "approved" ? "bg-moss/10 text-moss" :
    item.status === "rejected" ? "bg-rust/10 text-rust" :
    item.status === "changes_requested" ? "bg-gold/10 text-gold" : "bg-black/[0.05] text-ink-soft";

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide rounded bg-black/[0.05] px-1.5 py-0.5 text-ink-soft">
              {item.kind.replace("_", " ")}
            </span>
            <RiskTag risk={item.risk} />
          </div>
          <h3 className="mt-2 display text-[17px] font-semibold">{item.title}</h3>
          <p className="mt-1 text-[13px] text-ink-soft">{item.detail}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${badge}`}>
          {item.status.replace("_", " ")}
        </span>
      </div>

      {!resolved ? (
        <div className="mt-4 border-t hairline pt-4">
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Reviewer note (optional)…"
            className="w-full rounded-lg border hairline bg-white px-3 py-2 text-[13px] outline-none focus:border-accent mb-3" />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onDecide(item.id, "approved", note)}
              className="rounded-lg bg-moss px-4 py-2 text-[13px] font-medium text-white hover:opacity-90 transition-opacity">
              Approve
            </button>
            <button onClick={() => onDecide(item.id, "changes_requested", note)}
              className="rounded-lg border border-gold/40 bg-gold/[0.06] px-4 py-2 text-[13px] font-medium text-gold hover:bg-gold/[0.12] transition-colors">
              Request changes
            </button>
            <button onClick={() => onDecide(item.id, "rejected", note)}
              className="rounded-lg border border-rust/30 bg-rust/[0.04] px-4 py-2 text-[13px] font-medium text-rust hover:bg-rust/[0.1] transition-colors">
              Reject
            </button>
          </div>
        </div>
      ) : (
        item.note && (
          <div className="mt-3 border-t hairline pt-3 text-[12px] text-ink-soft">
            <span className="font-medium text-ink">Reviewer note:</span> {item.note}
          </div>
        )
      )}
    </div>
  );
}
