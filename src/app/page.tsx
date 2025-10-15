"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mission = {
  id: string;
  date: string;
  slot: number;
  title: string;
  brief: string;
  objective?: string | null;
};

export default function Home() {
  const router = useRouter();
  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/missions", { cache: "no-store" });
      const data = await res.json();
      if (!data?.ok) {
        setErr(data?.error || "Failed to load missions");
        setMissions([]);
        return;
      }
      setMissions(data.missions || []);
    })();
  }, []);

  async function startSession(missionId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const data = await res.json();
      if (!data?.ok) {
        alert(data?.error || "Failed to create session");
        return;
      }
      router.push(`/play?session=${data.sessionId}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-4 text-white">
      <h1 className="text-2xl font-bold mb-3">Les Coureurs — Daily Missions</h1>

      {err ? <div className="text-red-400 mb-3">{err}</div> : null}

      {missions === null ? (
        <div className="opacity-70">Loading…</div>
      ) : missions.length === 0 ? (
        <div className="opacity-70">No missions seeded for today.</div>
      ) : (
        <div className="grid gap-3">
          {missions.map((m) => (
            <div key={m.id} className="rounded border border-white/20 p-3 bg-black/30">
              <div className="flex items-center justify-between mb-1">
                <h2 className="font-semibold">{m.title}</h2>
                <span className="text-xs opacity-70">Slot {m.slot}</span>
              </div>

              <p className="opacity-90 mb-2">{m.brief}</p>

              {m.objective ? (
                <p className="text-sm opacity-80 mb-2">
                  <span className="opacity-70">Objective:</span> {m.objective}
                </p>
              ) : null}

              <button
                onClick={() => startSession(m.id)}
                disabled={loading}
                className="rounded border border-white/20 px-3 py-1 disabled:opacity-50"
              >
                {loading ? "Starting…" : "Start"}
              </button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
