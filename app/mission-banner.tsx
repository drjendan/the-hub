"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Per-company mission statement (a headline + body), shown at the top of the
 * dashboard. Editable by company admins/owners (canEdit). Hidden entirely for
 * non-admins when nothing is set.
 */
export function MissionBanner({
  orgId,
  initialMission,
  initialHeadline,
  canEdit,
}: {
  orgId: string;
  initialMission: string | null;
  initialHeadline: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(initialHeadline ?? "");
  const [value, setValue] = useState(initialMission ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/mission", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, mission: value, headline }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Could not save the mission.");
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

  // Graceful fallback: nothing to show for non-admins when nothing is set.
  if (!initialMission && !initialHeadline && !canEdit && !editing) return null;

  if (editing) {
    return (
      <div className="mt-6 card p-5">
        <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-accent font-semibold">Mission</div>
        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={160}
          placeholder="Headline — e.g. Empowering learners everywhere"
          className="mb-2 w-full rounded-lg border hairline bg-white px-3 py-2.5 text-[15px] font-semibold outline-none focus:border-accent"
        />
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Our mission is to…"
          className="w-full rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent resize-y"
        />
        {err && <p className="mt-2 text-[12px] text-rust">{err}</p>}
        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} disabled={busy}
            className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-paper hover:bg-ink-line disabled:opacity-40 transition-colors">
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => { setEditing(false); setValue(initialMission ?? ""); setHeadline(initialHeadline ?? ""); }}
            disabled={busy}
            className="text-[13px] text-ink-soft hover:text-ink disabled:opacity-40">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-xl border-l-2 border-terracotta bg-terracotta/[0.06] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-terracotta-deep font-semibold">Mission</div>
          {initialHeadline && (
            <h2 className="display text-[18px] font-semibold leading-tight text-ink">{initialHeadline}</h2>
          )}
          {initialMission ? (
            <p className={`text-[15px] leading-relaxed text-ink ${initialHeadline ? "mt-1" : ""}`}>{initialMission}</p>
          ) : !initialHeadline ? (
            <p className="text-[14px] italic text-ink-soft">No mission statement yet.</p>
          ) : null}
        </div>
        {canEdit && (
          <button onClick={() => setEditing(true)} className="shrink-0 text-[12px] text-accent hover:underline">
            {initialMission || initialHeadline ? "Edit" : "Add"}
          </button>
        )}
      </div>
    </div>
  );
}
