"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

type TurnRow = {
  id?: string;
  idx: number;
  player_input?: string;
  narrative: string;
  summary?: any;
  debug?: any;
  created_at?: string;
};

type SessionPayload = {
  ok: boolean;
  session?: {
    id: string;
    mission_id: string;
    actions_remaining?: number;
  };
  turns?: TurnRow[];
};

type MissionRow = {
  id: string;
  date: string; // YYYY-MM-DD
  slot: number;
  title: string;
  prompt?: string | null;          // mapped on API to mission_prompt ?? brief
  brief?: string | null;           // raw
  mission_prompt?: string | null;  // raw
  opening?: string | null;         // raw opener
};

export default function PlayPage() {
  const qp = useSearchParams();
  const router = useRouter();

  // Support both entry modes:
  // 1) /play?session=... (session already created)
  // 2) /play?mission=... (we need to create a session first)
  const sessionParam = qp.get("session") || "";
  const missionParam = qp.get("mission") || "";

  const [sessionId, setSessionId] = useState<string>(sessionParam);
  const [missionId, setMissionId] = useState<string>(missionParam);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [syntheticOpener, setSyntheticOpener] = useState<null | { title: string; text: string }>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  // If we came via ?mission=..., create a session first using your existing /api/session
  useEffect(() => {
    if (sessionId || !missionParam) return;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ missionId: missionParam }),
        });
        const j = await res.json();
        if (j?.sessionId) {
          setSessionId(j.sessionId);
          setMissionId(missionParam);
          // Optional: canonicalize URL to ?session=...
          const params = new URLSearchParams(qp.toString());
          params.delete("mission");
          params.set("session", j.sessionId);
          router.replace(`/play?${params.toString()}`);
        } else {
          console.error("Session create failed:", j);
        }
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionParam]);

  // Load session + existing turns from your existing /api/session/[id]
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch(`/api/session/${sessionId}`, { cache: "no-store" });
        const j: SessionPayload = await res.json();

        if (j?.ok && j.session) {
          setMissionId(j.session.mission_id);
        }
        if (j?.ok && Array.isArray(j.turns)) {
          setTurns(j.turns);
        }

        // If Turn-0 is missing, synthesize an opener purely for display
        const hasTurn0 = (j?.turns || []).some(t => t.idx === 0);
        if (!hasTurn0) {
          // Pull today's missions (your /api/missions maps prompt := mission_prompt ?? brief)
          const mr = await fetch("/api/missions", { cache: "no-store" });
          const missions: MissionRow[] = await mr.json();

          const m = missions.find(x => x.id === (j?.session?.mission_id || missionId));
          if (m) {
            const openerText =
              m.opening?.trim() ||
              m.mission_prompt?.trim() ||
              m.brief?.trim() ||
              m.prompt?.trim() ||
              ""; // last resort
            if (openerText) setSyntheticOpener({ title: m.title, text: openerText });
          }
        } else {
          setSyntheticOpener(null);
        }
      } catch (err) {
        console.error("Load session error:", err);
      } finally {
        setBusy(false);
      }
    })();
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  const actionsRemaining = useMemo(() => {
    // Count only post-opener turns (idx > 0)
    const nonOpeners = turns.filter(t => t.idx > 0).length;
    return Math.max(0, 10 - nonOpeners);
  }, [turns]);

  async function submitTurn(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionId || !input) return;
    setBusy(true);
    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, playerInput: input.slice(0, 50) }),
      });
      const j = await res.json();
      if (j?.ok) {
        setTurns(prev => [
          ...prev,
          {
            idx: j.turnIndex ?? prev.length,
            narrative: j.narrative,
            summary: j.engine?.outcomeSummary ? { outcome: j.engine.outcomeSummary } : undefined,
            debug: j.engine?.debug,
          },
        ]);
      } else {
        console.error("Turn failed:", j);
      }
    } finally {
      setBusy(false);
      setInput("");
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 text-white">
      <h1 className="mb-2 text-2xl font-semibold">Play</h1>
      <p className="mb-4 text-sm opacity-80">
        Actions remaining: {actionsRemaining} {busy ? " • working…" : ""}
      </p>

      <div className="space-y-4">
        {/* Render synthetic opener first if no Turn-0 row exists */}
        {syntheticOpener && (
          <section className="rounded-lg border border-white/15 p-4">
            <p className="whitespace-pre-wrap">{syntheticOpener.text}</p>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">Opener</summary>
              <pre className="mt-2 overflow-auto rounded bg-white/5 p-3 text-xs">
                {JSON.stringify({ summary: { opener: true, title: syntheticOpener.title } }, null, 2)}
              </pre>
            </details>
          </section>
        )}

        {/* Render actual stored turns (including Turn-0 if present) */}
        {turns.map((t) => (
          <section key={`${t.idx}-${t.created_at ?? ""}`} className="rounded-lg border border-white/15 p-4">
            <p className="whitespace-pre-wrap">{t.narrative}</p>

            {(t.debug || t.summary) && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {t.idx === 0 ? "Opener" : "Dev Panel"}
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-white/5 p-3 text-xs">
                  {JSON.stringify(
                    t.idx === 0
                      ? { summary: t.summary ?? { opener: true } }
                      : { summary: t.summary, debug: t.debug },
                    null,
                    2
                  )}
                </pre>
              </details>
            )}
          </section>
        ))}

        {!syntheticOpener && turns.length === 0 && (
          <p className="opacity-70">Preparing mission opener…</p>
        )}
      </div>

      <form onSubmit={submitTurn} className="sticky bottom-4 mt-6 flex gap-2 rounded-lg border border-white/20 p-2 backdrop-blur">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={50}
          placeholder="≤ 50 chars. e.g., scan for movement"
          className="flex-1 bg-transparent p-2 outline-none"
        />
        <button className="rounded-md border border-white/30 px-3 py-1 text-sm hover:bg-white/10">
          Go
        </button>
      </form>
    </main>
  );
}
