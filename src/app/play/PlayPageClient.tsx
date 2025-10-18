// src/app/play/PlayPageClient.tsx
"use client";

import React, { useEffect, useState } from "react";
import type { TurnDebug, GameState } from "@/types";
import { useSearchParams } from "next/navigation";
import { applyWorldDelta, normalizeGameState } from "@/lib/gameState";
import type { WorldDelta } from "@/lib/gameState";

// ---------- Local types (keep client-only; avoid server refactors) ----------
type TurnLog = {
  role: "user" | "gm";
  text: string;
  debug?: TurnDebug;
};

type ApiSessionResponse = {
  ok: boolean;
  error?: string;
  session?: {
    id?: string;
    actions_remaining?: number | null;
    state?: unknown;
  } | null;
  turns?: Array<{
    idx: number;
    player_input: string | null;
    narrative: string;
    debug?: TurnDebug | null;
  }>;
};

type MissionType = "Deliver" | "Rescue" | "Recover" | "Hunt" | "Escort" | "Unknown";

type GmMission = {
  title: string;
  brief: string;
  objective: string | null;
  opening: string | null;
  mission_prompt: string | null;
  mission_type: MissionType;
};

type GmStartInput = {
  worldCapsule: string;
  mission: GmMission;
  session: {
    actionsRemaining: number;
    pressures?: Array<"powder" | "salt" | "oil" | "water" | "medicine">;
    flags?: Record<string, boolean>;
  };
  player: {
    name: string;
    inventory: Array<{ name: string; qty: number }>;
    stats?: Record<string, number>;
    conditions?: string[];
  };
};

type GmTurnInput = GmStartInput & {
  last: { actionText: string | null };
  sessionId?: string;
};

type GmOutput = {
  narration: string; // main text
  summary: string[]; // 1-3 bullets
  actionsRemaining: number;
  debug?: TurnDebug; // allow debug from server
  state?: GameState;
};

// ------------------------- Utility type guards -------------------------
type UnknownRec = Record<string, unknown>;
const isObject = (v: unknown): v is UnknownRec => typeof v === "object" && v !== null;

function isGmOutput(u: unknown): u is GmOutput {
  if (!isObject(u)) return false;
  return (
    typeof u.narration === "string" &&
    Array.isArray(u.summary) &&
    typeof u.actionsRemaining === "number"
  );
}

type ApiTurnResponse = {
  ok?: boolean;
  narrative?: string;
  engine?: {
    actionsRemaining?: number;
    debug?: TurnDebug | null;   // <-- instead of a custom shape
  } | null;
};

function isApiTurnResponse(u: unknown): u is ApiTurnResponse {
  if (!isObject(u)) return false;

  const ok = (u as { ok?: unknown }).ok;
  const narrative = (u as { narrative?: unknown }).narrative;
  const engineUnknown = (u as { engine?: unknown }).engine;

  if (typeof ok === "boolean") return true;
  if (typeof narrative === "string") return true;

  if (isObject(engineUnknown)) {
    const ar = (engineUnknown as { actionsRemaining?: unknown }).actionsRemaining;
    const dbg = (engineUnknown as { debug?: unknown }).debug;
    if (Number(ar)) return true;
    if (dbg === null || isObject(dbg)) return true;
  }

  return false;
}

// allow caching on window without any
declare global {
  interface Window {
    __lastSessionState?: GameState;
  }
}

// ------------------------- Helpers to shape payloads -------------------------
function toGmMission(state: GameState | UnknownRec | undefined): GmMission {
  const st = isObject(state) ? (state as UnknownRec) : {};
  const mission = isObject(st.mission) ? (st.mission as UnknownRec) : {};

  const rawType = mission.mission_type;
  const missionType: MissionType =
    typeof rawType === "string" &&
    ["Deliver", "Rescue", "Recover", "Hunt", "Escort", "Unknown"].includes(rawType)
      ? (rawType as MissionType)
      : "Unknown";

  const title = typeof mission.title === "string" ? mission.title : "Unknown";
  const brief =
    typeof mission.brief === "string"
      ? mission.brief
      : typeof mission.objective === "string"
      ? (mission.objective as string)
      : "";

  return {
    title,
    brief,
    objective: typeof mission.objective === "string" ? (mission.objective as string) : null,
    opening: typeof mission.opening === "string" ? (mission.opening as string) : null,
    mission_prompt:
      typeof mission.mission_prompt === "string"
        ? (mission.mission_prompt as string)
        : typeof mission.prompt === "string"
        ? (mission.prompt as string)
        : null,
    mission_type: missionType,
  };
}

function toPlayer(state: GameState | UnknownRec | undefined) {
  const st = isObject(state) ? (state as UnknownRec) : {};
  const invRaw = Array.isArray((st as GameState).inventory) ? ((st as GameState).inventory as unknown[]) : [];
  const inventory = invRaw
    .filter(isObject)
    .map((it) => ({
      name: typeof it.name === "string" ? (it.name as string) : "Item",
      qty: typeof it.qty === "number" ? (it.qty as number) : 1,
    }));
  return { name: "Runner", inventory };
}

function toGmSession(state: GameState | undefined, actionsRemaining: number | null): GmStartInput["session"] {
  const flags = state?.flags?.length
    ? state.flags.reduce<Record<string, boolean>>((acc, flag) => {
        acc[flag] = true;
        return acc;
      }, {})
    : undefined;
  return {
    actionsRemaining: typeof actionsRemaining === "number" ? actionsRemaining : 10,
    flags,
  };
}

// --------------------------------- Client UI ---------------------------------------
export function PlayPageClient() {
  const [log, setLog] = useState<TurnLog[]>([]);
  const [input, setInput] = useState("");
  const [actions, setActions] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const sessionId = searchParams.get("s") || searchParams.get("session") || searchParams.get("id");

  // Load session + prior turns. If brand-new (no turns), get opening via /api/gm/start
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setError(null);
      try {
        const res = await fetch(`/api/session/${sessionId}`, { cache: "no-store" });
        const data: ApiSessionResponse = await res.json();

        const normalizedState = normalizeGameState(data?.session?.state);

        // Cache the normalized state for GM payloads (client-only convenience)
        if (typeof window !== "undefined") {
          window.__lastSessionState = normalizedState;
        }

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

        // If brand-new session (no prior turns), ask GM to stage the opening scene
        if ((turns?.length ?? 0) === 0) {
          try {
            const gmStartBody: GmStartInput = {
              worldCapsule: "", // server also knows WORLD_CAPSULE
              mission: toGmMission(normalizedState),
              session: toGmSession(normalizedState, data.session?.actions_remaining ?? null),
              player: toPlayer(normalizedState),
            };

            const startRes = await fetch("/api/gm/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(gmStartBody),
            });
            const startRaw: unknown = await startRes.json().catch(() => ({} as unknown));
            if (startRes.ok && isGmOutput(startRaw)) {
              setLog((prev) => [...prev, { role: "gm", text: startRaw.narration }]);
              setActions(
                typeof startRaw.actionsRemaining === "number"
                  ? startRaw.actionsRemaining
                  : data.session?.actions_remaining ?? null
              );
            }
          } catch {
            // ignore; user can still act
          }
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [sessionId]);

  async function send() {
    setError(null);
    if (!sessionId || !input.trim()) {
      setError(!sessionId ? "Missing sessionId" : "Enter an action");
      return;
    }
    const action = input.slice(0, 50);
    setInput("");

    // echo user action immediately
    setLog((prev) => [...prev, { role: "user", text: action }]);
    setLoading(true);

    try {
      const lastState = typeof window !== "undefined" ? window.__lastSessionState : undefined;
      const normalizedState = normalizeGameState(lastState);
      if (typeof window !== "undefined") {
        window.__lastSessionState = normalizedState;
      }

      const res = await fetch("/api/gm/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worldCapsule: "",
          mission: toGmMission(normalizedState),
          session: toGmSession(normalizedState, actions),
          player: toPlayer(normalizedState),
          last: { actionText: action },
          sessionId,
        } satisfies GmTurnInput),
      });

      const rawUnknown: unknown = await res.json().catch(() => ({} as unknown));

      // Accept either legacy { ok, narrative, engine } or GM { narration, actionsRemaining }
      if (!res.ok && !isGmOutput(rawUnknown)) {
        const msg =
          (isObject(rawUnknown) && typeof (rawUnknown as UnknownRec).error === "string"
            ? ((rawUnknown as UnknownRec).error as string)
            : undefined) || `HTTP ${res.status}`;
        setError(msg);
        setLog((prev) => [...prev, { role: "gm", text: `⛔ ${msg}` }]);
        return;
      }

      if (isGmOutput(rawUnknown)) {
        const gmOut = rawUnknown;
        setActions(gmOut.actionsRemaining);
        setLog((prev) => [...prev, { role: "gm", text: gmOut.narration, debug: gmOut.debug }]);

        if (typeof window !== "undefined") {
          const base = normalizeGameState(window.__lastSessionState);
          const nextState = gmOut.state
            ? normalizeGameState(gmOut.state)
            : applyWorldDelta(base, (gmOut.debug?.stateDelta as WorldDelta | null | undefined) ?? null);
          window.__lastSessionState = nextState;
        }
      } else if (isApiTurnResponse(rawUnknown)) {
        const data = rawUnknown;
        setLog((prev) => [
          ...prev,
          {
            role: "gm",
            text: data.narrative ?? "⚠ No narrative returned",
            debug: data.engine?.debug ?? undefined,
          },
        ]);
        if (typeof data.engine?.actionsRemaining === "number") {
          setActions(data.engine.actionsRemaining);
        }
        if (typeof window !== "undefined" && data.engine?.debug?.stateDelta) {
          const base = normalizeGameState(window.__lastSessionState);
          window.__lastSessionState = applyWorldDelta(
            base,
            (data.engine.debug.stateDelta as WorldDelta | null | undefined) ?? null
          );
        }
      } else {
        // Unknown shape
        setLog((prev) => [...prev, { role: "gm", text: "⚠ Unexpected response shape" }]);
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
      <div className="mb-2 text-sm opacity-80">Actions remaining: {actions ?? "—"}</div>

      {error && (
        <div className="mb-3 rounded bg-red-900/30 border border-red-700/50 p-2 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3 mb-4">
        {log.map((t, i) => (
          <div
            key={i}
            className={`rounded p-3 whitespace-pre-wrap ${
              t.role === "gm" ? "bg-zinc-800/60 border border-zinc-700" : "bg-zinc-700/60 border border-zinc-600"
            }`}
          >
            <div className="text-xs uppercase tracking-wide opacity-70 mb-1">
              {t.role === "gm" ? "GM" : "You"}
            </div>
            <div>{t.text}</div>
            {t.debug && (
              <details className="mt-2 text-xs opacity-80">
                <summary className="cursor-pointer">Debug</summary>
                <pre className="mt-1 overflow-x-auto">{JSON.stringify(t.debug, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading) send();
        }}
        className="flex gap-2"
      >
        <input
          className="flex-1 rounded bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm"
          placeholder="What do you do?"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={120}
          disabled={loading}
        />
        <button
          type="submit"
          className="rounded bg-emerald-600 hover:bg-emerald-700 px-4 py-2 text-sm disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "..." : "Send"}
        </button>
      </form>
    </main>
  );
}

export default PlayPageClient;
