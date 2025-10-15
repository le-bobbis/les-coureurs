"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DevSeedButton from "@/components/DevSeedButton";

type Mission = {
  id: string;
  date: string;
  slot: number;
  title: string;
  prompt: string | null;
  objective: string | null;
  mission_type: string | null;
  factions: string[];
  displayBrief: string | null;
};

export default function HomePage() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadMissions() {
    try {
      setFetchErr(null);
      const res = await fetch("/api/missions", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load missions");
      setMissions(json as Mission[]);
    } catch (e: any) {
      setFetchErr(e.message || "Failed to load missions");
      setMissions([]);
    }
  }

  useEffect(() => {
    loadMissions();
  }, []);

  async function startSession(missionId: string) {
    try {
      setLoading(true);
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const json = await res.json();
      if (!res.ok || !json?.sessionId) {
        throw new Error(json?.error || "Could not start session");
      }
      router.push(`/play?session=${encodeURIComponent(json.sessionId)}`);
    } catch (e: any) {
      alert(e.message || "Could not start session");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 text-white">
      <h1 className="mb-3 text-2xl font-bold">Les Coureurs — Daily Missions</h1>

      {process.env.NODE_ENV !== "production" && <DevSeedButton />}

      {fetchErr && <p className="mb-3 text-sm text-red-300">Error: {fetchErr}</p>}

      <div className="grid gap-4">
        {missions.length ? (
          missions.map((m) => (
            <article key={m.id} className="rounded-lg border border-white/15 p-4">
              <header className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-lg font-medium">
                  {m.title} <span className="opacity-60">• Slot {m.slot}</span>
                </h2>
                {m.mission_type && (
                  <span className="rounded-full border border-white/25 px-2 py-0.5 text-xs opacity-90">
                    {m.mission_type}
                  </span>
                )}
              </header>

              {/* Faction chips */}
              {m.factions?.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {m.factions.map((f) => (
                    <span key={f} className="rounded-md border border-white/15 px-2 py-0.5 text-xs opacity-80">
                      {f}
                    </span>
                  ))}
                </div>
              )}

              {/* Long paragraph (prompt) FIRST */}
              {m.prompt && <p className="mt-1 text-sm">{m.prompt}</p>}

              {/* Objective SECOND */}
              {m.objective && (
                <p className="mt-2 text-sm opacity-80">Objective: {m.objective}</p>
              )}

              <div className="mt-3">
                <button
                  onClick={() => startSession(m.id)}
                  disabled={loading}
                  className="rounded-md border border-white/30 px-3 py-1 text-sm hover:bg-white/10 disabled:opacity-50"
                >
                  Start
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="opacity-70">
            No missions yet. {process.env.NODE_ENV !== "production" ? "Click “Seed today’s missions.”" : "Please check back later."}
          </p>
        )}
      </div>
    </main>
  );
}
