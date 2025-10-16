// src/components/DevSeedButton.tsx
"use client";

import { useState } from "react";

export function DevSeedButton() {
  const [loading, setLoading] = useState<"llm" | "static" | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSeed(mode: "llm" | "static") {
    try {
      setLoading(mode);
      setResult(null);

      const res = await fetch(`/api/seed?mode=${mode}`, { method: "POST" });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to seed missions");
      }

      const msg =
        json.inserted ? `✅ Inserted ${json.inserted} missions (${mode.toUpperCase()})`
                      : "⚠️ No missions inserted.";
      setResult(msg);

      // optional: quick auto-refresh so the cards appear immediately
      setTimeout(() => window.location.reload(), 650);
    } catch (e: any) {
      setResult(`❌ ${e.message || "Unknown error"}`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center mt-4">
      <button
        onClick={() => handleSeed("llm")}
        disabled={!!loading}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading === "llm" ? "Seeding…" : "Seed Missions (LLM)"}
      </button>

      <button
        onClick={() => handleSeed("static")}
        disabled={!!loading}
        className="rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
      >
        {loading === "static" ? "Seeding…" : "Seed Missions (Static)"}
      </button>

      {result && <p className="text-xs opacity-80 mt-1 sm:mt-0 sm:ml-2">{result}</p>}
    </div>
  );
}
