"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface RunResult {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  spam: boolean | null;
  reason: string;
}

export function AgentRunner({
  agentId,
  agentSlug,
  oauthConfigured,
  connected,
  accountEmail,
  connectionId,
}: {
  agentId: string;
  agentSlug: string;
  oauthConfigured: boolean;
  connected: boolean;
  accountEmail: string | null;
  connectionId: string | null;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<RunResult[] | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Read ?connected / ?connect_error from the OAuth redirect, then clean the URL.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("connected") === "gmail") setBanner({ tone: "ok", text: "Gmail connected." });
    const ce = sp.get("connect_error");
    if (ce) {
      const msg =
        ce === "not_configured"
          ? "Gmail OAuth isn't configured yet (admin must set GOOGLE_OAUTH_CLIENT_ID/SECRET)."
          : `Couldn't connect Gmail: ${ce.replace(/_/g, " ")}.`;
      setBanner({ tone: "err", text: msg });
    }
    if (sp.get("connected") || sp.get("connect_error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connectHref = `/api/connections/google/start?next=${encodeURIComponent(`/hub/${agentSlug}`)}`;

  async function run() {
    setError(null);
    setResults(null);
    setRunning(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/run`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Run failed.");
        return;
      }
      setResults(data.results || []);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  async function disconnect() {
    if (!connectionId) return;
    await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
    router.refresh();
  }

  const spamCount = results?.filter((r) => r.spam === true).length ?? 0;

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="display text-[18px] font-semibold">Test run · Gmail</h2>
        {connected && accountEmail && (
          <span className="text-[12px] text-ink-soft truncate">{accountEmail}</span>
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-soft">
        Read-only: scans your recent inbox and flags likely spam using this agent&apos;s prompt.
        Nothing in Gmail is changed.
      </p>

      {banner && (
        <p className={`mt-3 text-[12px] ${banner.tone === "ok" ? "text-moss" : "text-rust"}`}>{banner.text}</p>
      )}

      <div className="mt-4">
        {!oauthConfigured ? (
          <div className="rounded-lg border hairline bg-white p-3 text-[13px] text-ink-soft">
            Gmail connection isn&apos;t configured on the server yet. Add the Google OAuth client
            credentials (see setup), then reload.
          </div>
        ) : !connected ? (
          <a
            href={connectHref}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-[14px] font-medium text-paper hover:bg-ink-line transition-colors"
          >
            <span>🔗</span> Connect Gmail
          </a>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={run}
              disabled={running}
              className="rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-white hover:bg-accent-deep disabled:opacity-40 transition-colors"
            >
              {running ? "Scanning inbox…" : "Run on my inbox"}
            </button>
            <button
              onClick={disconnect}
              className="rounded-lg border hairline bg-white px-3 py-2.5 text-[13px] text-ink-soft hover:text-ink transition-colors"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-[12px] text-rust">{error}</p>}

      {results && (
        <div className="mt-5">
          <div className="text-[12px] text-ink-soft mb-2">
            Scanned {results.length} recent email{results.length === 1 ? "" : "s"} ·{" "}
            <span className="text-rust font-medium">{spamCount} flagged as spam</span>
          </div>
          {results.length === 0 ? (
            <p className="text-[13px] text-ink-soft">No recent inbox emails found.</p>
          ) : (
            <div className="space-y-2">
              {results.map((r) => (
                <div key={r.id} className="rounded-lg border hairline px-3 py-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">{r.subject}</div>
                      <div className="text-[12px] text-ink-soft truncate">{r.from}</div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        r.spam === true
                          ? "bg-rust/10 text-rust"
                          : r.spam === false
                          ? "bg-moss/10 text-moss"
                          : "bg-black/[0.05] text-ink-soft"
                      }`}
                    >
                      {r.spam === true ? "Spam" : r.spam === false ? "Not spam" : "—"}
                    </span>
                  </div>
                  {r.reason && <div className="mt-1 text-[12px] text-ink-soft">{r.reason}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
