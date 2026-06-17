"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  name: string;
}

/**
 * Access card for the agent detail page — shown to the owner / company admins.
 * Toggle Everyone vs Restricted and assign specific company members.
 */
export function AccessManager({
  agentId,
  ownerName,
  initialVisibility,
  initialAssigned,
  members,
}: {
  agentId: string;
  ownerName: string;
  initialVisibility: "everyone" | "restricted";
  initialAssigned: Member[];
  members: Member[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [visibility, setVisibility] = useState(initialVisibility);
  const [picked, setPicked] = useState<Set<string>>(new Set(initialAssigned.map((m) => m.id)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility, user_ids: Array.from(picked) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not save access.");
        return;
      }
      setEditing(false);
      router.refresh();
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-[12px] uppercase tracking-[0.12em] text-ink-soft">Access</h3>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-[12px] text-accent hover:underline">
            Manage
          </button>
        )}
      </div>

      {!editing ? (
        <div className="text-[13px]">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${initialVisibility === "restricted" ? "bg-gold" : "bg-moss"}`} />
            <span className="font-medium capitalize">{initialVisibility}</span>
            <span className="text-ink-soft">
              {initialVisibility === "restricted" ? "· assigned users only" : "· all company members"}
            </span>
          </div>
          {initialVisibility === "restricted" && (
            <div className="mt-3 space-y-1.5">
              <div className="text-[12px] text-ink-soft">Has access:</div>
              <div className="text-[13px]">{ownerName} <span className="text-ink-soft">(owner)</span></div>
              {initialAssigned.map((m) => (
                <div key={m.id} className="text-[13px]">{m.name}</div>
              ))}
              {initialAssigned.length === 0 && (
                <div className="text-[12px] text-ink-soft">No additional users assigned yet.</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex gap-1 rounded-lg border hairline bg-white p-1 mb-3">
            {(["everyone", "restricted"] as const).map((v) => (
              <button key={v} onClick={() => setVisibility(v)}
                className={`flex-1 rounded-md px-3 py-1.5 text-[12px] capitalize transition-colors ${
                  visibility === v ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
                }`}>
                {v}
              </button>
            ))}
          </div>

          {visibility === "restricted" && (
            <div className="mb-3 max-h-56 overflow-y-auto rounded-lg border hairline divide-y divide-[var(--line)]">
              <div className="px-3 py-2 text-[12px] text-ink-soft">{ownerName} (owner · always)</div>
              {members
                .filter((m) => m.name !== ownerName)
                .map((m) => (
                  <label key={m.id} className="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer hover:bg-black/[0.02]">
                    <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} className="accent-[var(--accent)]" />
                    {m.name}
                  </label>
                ))}
              {members.length === 0 && <div className="px-3 py-2 text-[12px] text-ink-soft">No other members in this company.</div>}
            </div>
          )}

          {err && <p className="mb-2 text-[12px] text-rust">{err}</p>}
          <div className="flex items-center gap-3">
            <button onClick={save} disabled={busy}
              className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-paper hover:bg-ink-line disabled:opacity-40 transition-colors">
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={() => setEditing(false)} disabled={busy} className="text-[13px] text-ink-soft hover:text-ink disabled:opacity-40">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
