"use client";

import { useState } from "react";

/**
 * Generic runner for connector-less published agents. Two inputs: pasted text
 * OR an uploaded .txt/.md/PDF (≤4 MB). Posts multipart to /run-text.
 */
export function GenericRunner({ agentId }: { agentId: string }) {
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run() {
    setError(null);
    setOutput(null);
    setNote(null);
    setRunning(true);
    try {
      const fd = new FormData();
      if (file) fd.append("file", file);
      else fd.append("input", input);
      const res = await fetch(`/api/agents/${agentId}/run-text`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Run failed.");
        return;
      }
      setOutput(data.output ?? "");
      if (data.truncated) setNote("Input was long — it was truncated before running.");
    } catch {
      setError("Could not reach the server.");
    } finally {
      setRunning(false);
    }
  }

  const canRun = !running && (file !== null || input.trim().length > 0);

  return (
    <section className="card p-5">
      <h2 className="display text-[18px] font-semibold">Run · text or file</h2>
      <p className="mt-1 text-[13px] text-ink-soft">
        Paste text, or upload a <span className="font-medium">.txt</span>,{" "}
        <span className="font-medium">.md</span>, or <span className="font-medium">PDF</span> (≤4 MB). The agent
        processes it with its prompt.
      </p>

      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={!!file}
        rows={6}
        placeholder={file ? "Using the uploaded file…" : "Paste your text here — e.g. raw meeting notes to summarize…"}
        className="mt-3 w-full rounded-lg border hairline bg-white px-3 py-2.5 text-[14px] outline-none focus:border-accent resize-y disabled:bg-black/[0.03] disabled:text-ink-soft"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border hairline bg-white px-3 py-2 text-[13px] text-ink-soft hover:text-ink transition-colors">
          {file ? "Change file" : "Upload .txt / .md / PDF"}
          <input
            type="file"
            accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        {file && (
          <span className="text-[12px] text-ink-soft">
            {file.name} · {(file.size / 1024).toFixed(0)} KB
            <button onClick={() => setFile(null)} className="ml-2 text-rust hover:underline">
              remove
            </button>
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={run}
          disabled={!canRun}
          className="rounded-lg bg-accent px-4 py-2.5 text-[14px] font-medium text-white hover:bg-accent-deep disabled:opacity-40 transition-colors"
        >
          {running ? "Running…" : "Run"}
        </button>
        {!file && <span className="text-[12px] text-ink-soft">{input.length.toLocaleString()} chars</span>}
      </div>

      {error && <p className="mt-3 text-[12px] text-rust">{error}</p>}
      {note && <p className="mt-3 text-[12px] text-ink-soft">{note}</p>}

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
