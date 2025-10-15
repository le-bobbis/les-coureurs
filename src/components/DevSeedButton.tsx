"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DevSeedButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [mode, setMode] = useState<"llm" | "static">("llm");
  const router = useRouter();

  async function seed() {
    try {
      setLoading(true);
      setMsg(null);
      setDetail(null);

      const res = await fetch(`/api/seed?mode=${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) throw new Error(json?.error || "Seed failed");

      setMsg(
        `${json.mode_used === "llm" ? "LLM" : "Static"}: ${json.count} missions for ${json.date}.`
      );
      setDetail(json.llm_debug || null);

      router.refresh();
    } catch (e: any) {
      setMsg(e.message || "Seed failed");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-white/20 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <label className="opacity-80">Mode:</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "llm" | "static")}
            className="rounded border border-white/30 bg-transparent px-2 py-1 text-sm"
          >
            <option value="llm">LLM (uses OPENAI_API_KEY)</option>
            <option value="static">Static</option>
          </select>
        </div>

        <button
          onClick={seed}
          disabled={loading}
          className="rounded-md border border-white/30 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? "Working…" : "Seed today’s missions"}
        </button>
      </div>

      {msg && <span className="text-sm opacity-90">{msg}</span>}
      {detail && (
        <details className="text-xs opacity-80">
          <summary>LLM debug</summary>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-white/5 p-2">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
