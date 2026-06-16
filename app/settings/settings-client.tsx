"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrgProviderKey } from "@/lib/supabase/types";

const PROVIDERS: { id: OrgProviderKey["provider"]; label: string; placeholder: string }[] = [
  { id: "openai", label: "ChatGPT (OpenAI)", placeholder: "sk-…" },
  { id: "anthropic", label: "Claude (Anthropic)", placeholder: "sk-ant-…" },
  { id: "google", label: "Gemini (Google)", placeholder: "AIza…" },
];

export function SettingsClient({ initialKeys }: { initialKeys: OrgProviderKey[] }) {
  const byProvider = new Map(initialKeys.map((k) => [k.provider, k]));
  return (
    <div className="mt-6 space-y-4">
      {PROVIDERS.map((p) => (
        <ProviderCard key={p.id} provider={p} existing={byProvider.get(p.id) ?? null} />
      ))}
    </div>
  );
}

function ProviderCard({
  provider,
  existing,
}: {
  provider: { id: OrgProviderKey["provider"]; label: string; placeholder: string };
  existing: OrgProviderKey | null;
}) {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(existing?.model ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/org/keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id, api_key: apiKey, model: model || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({ tone: "err", text: data.error || "Could not save the key." });
        return;
      }
      setApiKey(""); // never keep the raw key in component state after save
      setMsg({ tone: "ok", text: `Validated and saved (${data.key.key_hint}).` });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/org/keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provider.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMsg({ tone: "err", text: data.error || "Could not remove the key." });
        return;
      }
      setModel("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3 border-b hairline pb-4">
        <div>
          <h3 className="display text-[17px] font-semibold leading-tight">{provider.label}</h3>
          {existing ? (
            <div className="mt-1 text-[12px] text-ink-soft">
              Configured · <span className="mono">{existing.key_hint}</span>
              {existing.model ? ` · ${existing.model}` : ""}
            </div>
          ) : (
            <div className="mt-1 text-[12px] text-ink-soft">Not configured — runs use the platform key.</div>
          )}
        </div>
        {existing && (
          <button
            onClick={remove}
            disabled={busy}
            className="text-[12px] text-rust hover:underline disabled:opacity-40 shrink-0"
          >
            Remove
          </button>
        )}
      </div>

      <form onSubmit={save} className="mt-4 flex flex-col sm:flex-row gap-2">
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={existing ? "Enter a new key to replace" : provider.placeholder}
          className="flex-1 rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        />
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="model (optional)"
          className="sm:w-44 rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={busy || !apiKey.trim()}
          className="rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-soft disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          {busy ? "Testing…" : "Test & save"}
        </button>
      </form>
      {msg && (
        <p className={`mt-2 text-[12px] ${msg.tone === "ok" ? "text-moss" : "text-rust"}`}>{msg.text}</p>
      )}
    </div>
  );
}
