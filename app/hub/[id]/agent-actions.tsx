"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Delete control for the agent detail page. Two-step confirm; the actual
 * permission check is enforced server-side in DELETE /api/agents.
 */
export function AgentActions({ agentId, agentName }: { agentId: string; agentName: string }) {
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
        body: JSON.stringify({ id: agentId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErr(data.error || "Could not delete this agent.");
        setBusy(false);
        return;
      }
      router.push("/hub");
      router.refresh();
    } catch {
      setErr("Could not delete this agent.");
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-rust/30 bg-rust/[0.04] px-4 py-2.5 text-[13px] font-medium text-rust hover:bg-rust/[0.1] transition-colors"
      >
        Delete agent
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-rust/30 bg-rust/[0.04] p-3">
      <p className="text-[12px] text-ink-soft mb-2">
        Permanently delete <span className="font-medium text-ink">{agentName}</span> and its versions?
      </p>
      {err && <p className="mb-2 text-[12px] text-rust">{err}</p>}
      <div className="flex items-center gap-3">
        <button onClick={del} disabled={busy}
          className="rounded-md bg-rust px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-40 transition-opacity">
          {busy ? "Deleting…" : "Yes, delete"}
        </button>
        <button onClick={() => setConfirming(false)} disabled={busy}
          className="text-[12px] text-ink-soft hover:text-ink disabled:opacity-40">
          Cancel
        </button>
      </div>
    </div>
  );
}
