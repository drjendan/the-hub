"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface Entry {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  active?: boolean;
  created_at: string;
}

export interface Pack {
  id: string;
  key: string;
  name: string;
  description: string | null;
  industry: string | null;
  requirements: string[];
}

export interface Doc {
  id: string;
  title: string;
  filename: string | null;
  created_at: string;
}

const TABS = [
  { id: "policies", label: "Policies" },
  { id: "best", label: "Best Practices" },
  { id: "compliance", label: "Compliance Packs" },
  { id: "documents", label: "Documents" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export function KnowledgeClient({
  policies,
  bestPractices,
  packs,
  enabledPackIds,
  documents,
  chunkCount,
  canManage,
  orgName,
}: {
  policies: Entry[];
  bestPractices: Entry[];
  packs: Pack[];
  enabledPackIds: string[];
  documents: Doc[];
  chunkCount: number;
  canManage: boolean;
  orgName: string;
}) {
  const [tab, setTab] = useState<TabId>("policies");

  return (
    <div className="px-6 sm:px-10 py-8 max-w-4xl mx-auto">
      <div className="border-b hairline pb-6">
        <div className="mb-1.5 text-[11px] uppercase tracking-[0.16em] text-accent font-semibold">Governance · knowledge</div>
        <h1 className="display text-[30px] font-semibold leading-none">Knowledge Base</h1>
        <p className="mt-2 text-[14px] text-ink-soft">
          {orgName ? `${orgName}'s ` : ""}guiding rules, best practices, and compliance — reference for building agents.
          {!canManage && " (Read-only — company admins manage this.)"}
        </p>
      </div>

      {canManage && <SyncBar chunkCount={chunkCount} />}

      <div className="mt-6 flex gap-1 rounded-lg border hairline bg-white p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
              tab === t.id ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "policies" && (
        <EntrySection endpoint="policies" items={policies} canManage={canManage} showActive
          addLabel="policy" emptyHint="No policies yet. Add company rules agents must follow." />
      )}
      {tab === "best" && (
        <EntrySection endpoint="best-practices" items={bestPractices} canManage={canManage}
          addLabel="best practice" emptyHint="No best-practice docs yet. Add guidance for builders." />
      )}
      {tab === "compliance" && (
        <ComplianceSection packs={packs} enabledPackIds={enabledPackIds} canManage={canManage} />
      )}
      {tab === "documents" && <DocumentsSection documents={documents} canManage={canManage} />}
    </div>
  );
}

function DocumentsSection({ documents, canManage }: { documents: Doc[]; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/knowledge/documents", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: "err", text: data.error || "Upload failed." });
        return;
      }
      setMsg({ tone: "ok", text: `Added “${data.title}”. Click Sync knowledge above to embed it.` });
      router.refresh();
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fetch("/api/knowledge/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-3">
      {canManage && (
        <div className="card p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors">
            {busy ? "Uploading…" : "Upload PDF or Word (.docx)"}
            <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden" onChange={upload} disabled={busy} />
          </label>
          <span className="ml-3 text-[12px] text-ink-soft">≤ 4 MB · text is extracted server-side. Re-Sync after uploading.</span>
          {msg && <p className={`mt-2 text-[12px] ${msg.tone === "ok" ? "text-moss" : "text-rust"}`}>{msg.text}</p>}
        </div>
      )}

      {documents.length === 0 && (
        <div className="card p-8 text-center text-[14px] text-ink-soft">
          No documents yet. Upload PDFs or Word docs to ground agents in their content.
        </div>
      )}
      {documents.map((d) => (
        <div key={d.id} className="card p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold truncate">{d.title}</h3>
            <div className="text-[12px] text-ink-soft truncate">{d.filename || "—"}</div>
          </div>
          {canManage && (
            <button onClick={() => remove(d.id)} disabled={busy} className="shrink-0 text-[12px] text-rust hover:underline disabled:opacity-40">
              Delete
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function SyncBar({ chunkCount }: { chunkCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/knowledge/reindex", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: "err", text: data.error || "Sync failed." });
        return;
      }
      setMsg({ tone: "ok", text: data.count ? `Indexed ${data.count} item${data.count === 1 ? "" : "s"} for AI grounding.` : (data.message || "Nothing to index.") });
      router.refresh();
    } catch {
      setMsg({ tone: "err", text: "Could not reach the server." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border hairline bg-accent/[0.03] px-4 py-2.5">
      <span className="text-[13px] text-ink-soft">
        <span className="font-medium text-ink">AI grounding (RAG)</span> · {chunkCount} item{chunkCount === 1 ? "" : "s"} indexed
      </span>
      <button onClick={sync} disabled={busy}
        className="rounded-lg bg-ink px-3 py-1.5 text-[12px] font-medium text-paper hover:bg-ink-soft disabled:opacity-40 transition-colors">
        {busy ? "Rebuilding…" : "Rebuild index"}
      </button>
      <span className="text-[12px] text-ink-soft">Updates automatically when you edit knowledge. Use Rebuild to re-embed everything.</span>
      {msg && <span className={`text-[12px] ${msg.tone === "ok" ? "text-moss" : "text-rust"}`}>{msg.text}</span>}
    </div>
  );
}

function EntrySection({
  endpoint, items, canManage, showActive = false, addLabel, emptyHint,
}: {
  endpoint: "policies" | "best-practices";
  items: Entry[];
  canManage: boolean;
  showActive?: boolean;
  addLabel: string;
  emptyHint: string;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mt-6 space-y-3">
      {canManage && (
        adding ? (
          <EntryForm endpoint={endpoint} onDone={() => { setAdding(false); router.refresh(); }} onCancel={() => setAdding(false)} />
        ) : (
          <button onClick={() => setAdding(true)}
            className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-paper hover:bg-ink-soft transition-colors">
            + Add {addLabel}
          </button>
        )
      )}

      {items.length === 0 && (
        <div className="card p-8 text-center text-[14px] text-ink-soft">{emptyHint}</div>
      )}
      {items.map((it) => (
        <EntryRow key={it.id} endpoint={endpoint} entry={it} canManage={canManage} showActive={showActive} />
      ))}
    </div>
  );
}

function EntryForm({
  endpoint, entry, onDone, onCancel,
}: {
  endpoint: "policies" | "best-practices";
  entry?: Entry;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? "");
  const [category, setCategory] = useState(entry?.category ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${endpoint}`, {
        method: entry ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry ? { id: entry.id, title, category, body } : { title, category, body }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || "Could not save."); return; }
      onDone();
    } catch {
      setErr("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 space-y-2.5">
      <div className="grid sm:grid-cols-3 gap-2.5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
          className="sm:col-span-2 rounded-lg border hairline bg-white px-3 py-2 text-[14px] outline-none focus:border-accent" />
        <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Category (optional)"
          className="rounded-lg border hairline bg-white px-3 py-2 text-[14px] outline-none focus:border-accent" />
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Details…"
        className="w-full rounded-lg border hairline bg-white px-3 py-2 text-[14px] outline-none focus:border-accent resize-y" />
      {err && <p className="text-[12px] text-rust">{err}</p>}
      <div className="flex items-center gap-3">
        <button onClick={submit} disabled={busy || !title.trim()}
          className="rounded-lg bg-ink px-4 py-2 text-[13px] font-medium text-paper hover:bg-ink-soft disabled:opacity-40 transition-colors">
          {busy ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} disabled={busy} className="text-[13px] text-ink-soft hover:text-ink disabled:opacity-40">Cancel</button>
      </div>
    </div>
  );
}

function EntryRow({
  endpoint, entry, canManage, showActive,
}: {
  endpoint: "policies" | "best-practices";
  entry: Entry;
  canManage: boolean;
  showActive: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function call(method: "PUT" | "DELETE", payload: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`/api/knowledge/${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return <EntryForm endpoint={endpoint} entry={entry} onDone={() => { setEditing(false); router.refresh(); }} onCancel={() => setEditing(false)} />;
  }

  const inactive = showActive && entry.active === false;

  return (
    <div className={`card p-4 ${inactive ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">{entry.title}</h3>
            {entry.category && <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] text-ink-soft">{entry.category}</span>}
            {showActive && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${entry.active === false ? "bg-black/[0.05] text-ink-soft" : "bg-moss/10 text-moss"}`}>
                {entry.active === false ? "Inactive" : "Active"}
              </span>
            )}
          </div>
          {entry.body && <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed whitespace-pre-wrap">{entry.body}</p>}
        </div>
      </div>
      {canManage && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t hairline pt-3 text-[12px]">
          <button onClick={() => setEditing(true)} className="text-accent hover:underline">Edit</button>
          {showActive && (
            <button onClick={() => call("PUT", { id: entry.id, active: !(entry.active !== false) })} disabled={busy} className="text-ink-soft hover:text-ink disabled:opacity-40">
              {entry.active === false ? "Activate" : "Deactivate"}
            </button>
          )}
          {!confirming ? (
            <button onClick={() => setConfirming(true)} className="text-rust hover:underline">Delete</button>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-ink-soft">Delete?</span>
              <button onClick={() => call("DELETE", { id: entry.id })} disabled={busy} className="font-medium text-rust hover:underline disabled:opacity-40">Yes</button>
              <button onClick={() => setConfirming(false)} disabled={busy} className="text-ink-soft hover:text-ink">No</button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ComplianceSection({
  packs, enabledPackIds, canManage,
}: {
  packs: Pack[];
  enabledPackIds: string[];
  canManage: boolean;
}) {
  const enabled = new Set(enabledPackIds);
  return (
    <div className="mt-6 space-y-3">
      {packs.length === 0 && (
        <div className="card p-8 text-center text-[14px] text-ink-soft">
          No compliance packs available. Run supabase/governance_kb.sql to seed the catalog.
        </div>
      )}
      {packs.map((p) => (
        <PackRow key={p.id} pack={p} isEnabled={enabled.has(p.id)} canManage={canManage} />
      ))}
    </div>
  );
}

function PackRow({ pack, isEnabled, canManage }: { pack: Pack; isEnabled: boolean; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await fetch("/api/knowledge/compliance", {
        method: isEnabled ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack_id: pack.id }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`card p-4 ${isEnabled ? "border-accent/40" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold">{pack.name}</h3>
            {pack.industry && <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] text-ink-soft">{pack.industry}</span>}
            {isEnabled && <span className="rounded-full bg-moss/10 px-2 py-0.5 text-[11px] font-medium text-moss">Enabled</span>}
          </div>
          {pack.description && <p className="mt-1.5 text-[13px] text-ink-soft leading-relaxed">{pack.description}</p>}
          <button onClick={() => setOpen((o) => !o)} className="mt-2 text-[12px] text-accent hover:underline">
            {open ? "Hide" : "Show"} {pack.requirements.length} requirement{pack.requirements.length === 1 ? "" : "s"}
          </button>
          {open && (
            <ul className="mt-2 space-y-1">
              {pack.requirements.map((r, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-ink-soft"><span className="text-accent">▸</span>{r}</li>
              ))}
            </ul>
          )}
        </div>
        {canManage && (
          <button onClick={toggle} disabled={busy}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-40 ${
              isEnabled ? "border hairline bg-white text-ink-soft hover:text-ink" : "bg-accent text-white hover:bg-accent-deep"
            }`}>
            {busy ? "…" : isEnabled ? "Disable" : "Enable"}
          </button>
        )}
      </div>
    </div>
  );
}
