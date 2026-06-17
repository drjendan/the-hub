"use client";

import { useState } from "react";

/**
 * Generic text-in / text-out runner for connector-less published agents.
 * Posts to /api/agents/:id/run-text and shows the model's output.
 */
export function GenericRunner({ agentId }: { agentId: string }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    setOutput(null);
    setRunning(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/run-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Run failed.");
        return;
      }
      setOutput(data.output ?? "");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="display text-[18px] font-semibold">Run · text</h2>
      <p className="mt-1 text-[13px] text-ink-soft">
        Paste or type input below. The agent processes it with its prompt and returns the result.
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={6}
        placeholder="Paste your text here — e.g. raw meeting notes to summarize…"
        className="mt-3 w-full rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent resize-y"
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={run}
          disabled={running || !input.trim()}
          className="rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-white hover:bg-accent-deep disabled:opacity-40 transition-colors"
        >
          {running ? "Running…" : "Run"}
        </button>
        <span className="text-[12px] text-ink-soft">{input.length.toLocaleString()} chars</span>
      </div>

      {error && <p className="mt-3 text-[12px] text-rust">{error}</p>}

      {output !== null && (
        <div className="mt-4">
          <div className="text-[12px] text-ink-soft mb-1.5">Output</div>
          <div className="rounded-lg border hairline bg-white p-3 text-[14px] leading-relaxed whitespace-pre-wrap">
            {output}
          </div>
        </div>
      )}
    </section>
  );
}
