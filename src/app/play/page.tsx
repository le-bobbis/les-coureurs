"use client";
import { useEffect, useState } from "react";
import type { TurnDebug } from "@/types";

type TurnLog = {
  role: "user" | "gm";
  text: string;
  debug?: TurnDebug;
};

type ApiSessionResponse = {
  ok: boolean;
  error?: string;
  session?: { actions_remaining?: number | null } | null;
  turns?: Array<{
    player_input: string | null;
    narrative: string;
    debug: TurnDebug | null;
    idx: number;
  }>;
};

type ApiTurnResponse = {
  ok: boolean;
  error?: string;
  narrative?: string;
  engine?: {
    actionsRemaining?: number;
    debug?: TurnDebug;
  };
};

export default function PlayPage() {
  const [sessionId, setSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [log, setLog] = useState<TurnLog[]>([]);
  const [actions, setActions] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // read sessionId from ?session=...
  useEffect(() => {
    const url = new URL(window.location.href);
    const sid = url.searchParams.get("session") || "";
    setSessionId(sid);
  }, []);

  // load existing session + turns (including Turn 0)
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setError(null);
      try {
        const res = await fetch(`/api/session/${sessionId}`, { cache: "no-store" });
        const data: ApiSessionResponse = await res.json();
        if (!data?.ok) {
          setError(data?.error || "Failed to load session");
          return;
        }
        setActions(data.session?.actions_remaining ?? null);

        const turns = data.turns ?? [];
        const seeded: TurnLog[] = [];
        for (const t of turns) {
          if (t.idx === 0) {
            // opening narrative only
            seeded.push({ role: "gm", text: t.narrative, debug: t.debug ?? undefined });
          } else {
            if (t.player_input) seeded.push({ role: "user", text: t.player_input });
            seeded.push({ role: "gm", text: t.narrative, debug: t.debug ?? undefined });
          }
        }
        setLog(seeded);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [sessionId]);

  async function send() {
    setError(null);
    if (!sessionId || !input) {
      setError(!sessionId ? "Missing sessionId" : "Enter an action");
      return;
    }
    const action = input.slice(0, 50);
    setInput("");

    // echo user action immediately
    setLog((prev) => [...prev, { role: "user", text: action }]);
    setLoading(true);

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId, playerInput: action }),
      });
      const data: ApiTurnResponse = await res.json().catch(() => ({ ok: false, error: "Bad JSON" }));

      if (!res.ok || !data.ok) {
        const msg = data?.error || `HTTP ${res.status}`;
        setError(msg);
        setLog((prev) => [...prev, { role: "gm", text: `⛔ ${msg}` }]);
        return;
      }

      setLog((prev) => [
        ...prev,
        { role: "gm", text: data.narrative ?? "⚠ No narrative returned", debug: data.engine?.debug },
      ]);

      if (typeof data.engine?.actionsRemaining === "number") {
        setActions(data.engine.actionsRemaining);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setLog((prev) => [...prev, { role: "gm", text: `⛔ ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-4 text-white">
      <h1 className="text-2xl font-bold mb-1">Play Session</h1>
      <div className="text-xs opacity-70 mb-3">
        Session: {sessionId || "(paste ?session=... in URL)"}{actions !== null ? <> • Actions: {actions}</> : null}
      </div>

      {error ? <div className="mb-3 text-red-400">Error: {error}</div> : null}

      <div className="space-y-3 mb-4">
        {log.map((t, i) => (
          <div key={i} className="rounded border border-white/20 p-3 whitespace-pre-wrap">
            <div className="text-xs opacity-60 mb-1">{t.role === "user" ? "You" : "LLM"}</div>
            {t.text}
            {t.role === "gm" && t.debug ? (
              <details className="mt-2">
                <summary className="cursor-pointer opacity-80">Dev Panel</summary>
                <pre className="text-xs opacity-80 overflow-auto">{JSON.stringify(t.debug, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-white/20 bg-black/40 p-2"
          placeholder="Enter action (≤ 50 chars)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={50}
        />
        <button onClick={send} disabled={loading} className="rounded border border-white/20 px-3">
          {loading ? "…" : "Send"}
        </button>
      </div>
    </main>
  );
}
