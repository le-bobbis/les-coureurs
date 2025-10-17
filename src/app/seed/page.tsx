// src/app/seed/page.tsx
"use client";

import { useState } from "react";
import type { ZodIssue } from "zod";
import { WORLD_CAPSULE } from "@/lib/worldCapsule";

type SeededRow = { slot: number; title: string; mission_type: string };
type ApiSuccess = { date: string; seeded: SeededRow[] };
type ApiError = { error: string; issues?: ZodIssue[] };

function isApiError(x: unknown): x is ApiError {
  return (
    typeof x === "object" &&
    x !== null &&
    "error" in x &&
    typeof (x as { error: unknown }).error === "string"
  );
}

function isApiSuccess(x: unknown): x is ApiSuccess {
  return (
    typeof x === "object" &&
    x !== null &&
    "date" in x &&
    "seeded" in x &&
    Array.isArray((x as { seeded: unknown }).seeded)
  );
}

export default function SeedPage() {
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [useCapsule, setUseCapsule] = useState<boolean>(true);
  const [capsule, setCapsule] = useState<string>(WORLD_CAPSULE);
  const [busy, setBusy] = useState<boolean>(false);
  const [log, setLog] = useState<string>("");

  async function handleSeed() {
    setBusy(true);
    setLog("Generating missions…");
    try {
      const res = await fetch("/api/seed-missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, useCapsule, capsule }),
      });

      const contentType = res.headers.get("content-type") || "";
      const raw = await res.text(); // read raw first so we can show HTML errors too

      if (!res.ok) {
        try {
          const data: unknown = JSON.parse(raw);
          if (isApiError(data) && data.issues) {
            const issueLines = data.issues
              .map((i) => `- ${Array.isArray(i.path) ? i.path.join(".") : ""}: ${i.message}`)
              .join("\n");
            setLog(`❌ Failed schema validation.\nIssues:\n${issueLines}`);
            return;
          }
          setLog(`❌ HTTP ${res.status} ${res.statusText}\n${raw.slice(0, 1500)}`);
          return;
        } catch {
          setLog(`❌ HTTP ${res.status} ${res.statusText}\n${raw.slice(0, 1500)}`);
          return;
        }
      }

      if (!contentType.includes("application/json")) {
        setLog(`❌ Expected JSON but got ${contentType}\n${raw.slice(0, 1500)}`);
        return;
      }

      const data: unknown = JSON.parse(raw);

      if (isApiError(data) && data.issues) {
        const issueLines = data.issues
          .map((i) => `- ${Array.isArray(i.path) ? i.path.join(".") : ""}: ${i.message}`)
          .join("\n");
        setLog(`❌ Failed schema validation.\nIssues:\n${issueLines}`);
        return;
      }

      if (!isApiSuccess(data)) {
        setLog(`❌ Unexpected response shape:\n${raw.slice(0, 1500)}`);
        return;
      }

      const lines =
        data.seeded
          .slice()
          .sort((a, b) => a.slot - b.slot)
          .map((m) => `[${m.slot}] ${m.title} (${m.mission_type})`)
          .join("\n") || "No rows returned?";

      setLog(`✅ Seeded ${data.seeded.length} missions for ${data.date}.\n— Slots:\n${lines}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setLog(`❌ ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Seed Daily Missions</h1>
        <p className="text-sm text-neutral-500">
          Generate three shared missions for a UTC date and upsert them into the database.
        </p>
      </header>

      <div className="grid gap-4">
        <label className="block">
          <span className="text-sm">UTC Date</span>
          <input
            className="mt-1 w-full rounded border px-3 py-2"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useCapsule}
            onChange={(e) => setUseCapsule(e.target.checked)}
          />
          Use World Capsule (recommended)
        </label>

        {useCapsule && (
          <label className="block">
            <span className="text-sm">World Capsule (edit per run if desired)</span>
            <textarea
              className="mt-1 w-full min-h-40 rounded border p-2 text-sm"
              value={capsule}
              onChange={(e) => setCapsule(e.target.value)}
            />
          </label>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSeed}
            disabled={busy}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {busy ? "Seeding…" : "Generate & Seed 3 Missions"}
          </button>
        </div>
      </div>

      <section>
        <h2 className="sr-only">Output</h2>
        <pre className="whitespace-pre-wrap rounded border p-3 text-sm">{log}</pre>
      </section>

      <p className="text-xs text-neutral-500">
        Re-clicking replaces the same <code>(date, slot)</code> rows via UPSERT, so you can iterate safely.
      </p>
    </main>
  );
}
