"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { TurnDebug } from "@/types";
import { useSearchParams } from "next/navigation";

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

type ApiTurnResponse = {
  ok: boolean;
  error?: string;
  narrative?: string;
  engine?: {
    actionsRemaining?: number;
    debug?: TurnDebug;
  };
};

// ---- GM payload shapes (mirrors src/lib/gmSchemas.ts, trimmed for client) ----

type MissionType = "Deliver" | "Rescue" | "Recover" | "Hunt" | "Escort" | "Unknown";

type GmMission = {
  title: string;
  brief: string;
  objective?: string | null;
  opening?: string | null;
  mission_prompt?: string | null;
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
};

type GmOutput = {
  narration: string; // main text
  summary: string[]; // 1-3 bullets
  actionsRemaining: number;
  debug?: TurnDebug;
};

// ------------------------- Helpers to shape payloads -------------------------

function toGmMission(state: any): GmMission {
  const mission = (state && typeof state === "object" ? (state as any).mission : null) || {};
  const missionType: MissionType = (typeof mission.mission_type === "string" &&
    ["Deliver", "Rescue", "Recover", "Hunt", "Escort", "Unknown"].includes(mission.mission_type))
    ? (mission.mission_type as MissionType)
    : "Unknown";

  return {
    title: typeof mission.title === "string" ? mission.title : "Unknown",
    brief:
      typeof mission.brief === "string"
        ? mission.brief
        : typeof mission.objective === "string"
        ? mission.objective
        : "",
    objective: typeof mission.objective === "string" ? mission.objective : null,
    opening: typeof mission.opening === "string" ? mission.opening : null,
    mission_prompt: typeof mission.mission_prompt === "string" ? mission.mission_prompt : null,
    mission_type: missionType,
  };
}

function toPlayer(state: any) {
  const invRaw = Array.isArray(state?.inventory) ? state.inventory : [];
  const inventory = invRaw.map((it: any) => ({
    name: typeof it?.name === "string" ? it.name : "Item",
    qty: typeof it?.qty === "number" ? it.qty : 1,
  }));
  return { name: "Runner", inventory };
}

// --------------------------------- UI ---------------------------------------

export default function PlayPage() {
  const [log, setLog] = useState<TurnLog[]>([]);
  const [input, setInput] = useState("");
  const [actions, setActions] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

const searchParams = useSearchParams();
const sessionId =
  searchParams.get("s") ||
  searchParams.get("session") ||
  searchParams.get("id");

  // Load session + prior turns. If brand-new (no turns), get opening via /api/gm/start
  useEffect(() => {
    if (!sessionId) return;
    (async () => {
      setError(null);
      try {
        const res = await fetch(`/api/session/${sessionId}`, { cache: "no-store" });
        const data: ApiSessionResponse = await res.json();

        // Cache the raw state for GM payloads (client-only convenience)
        if (typeof window !== "undefined") {
          (window as any).__lastSessionState = (data as any)?.session?.state || {};
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
              mission: toGmMission((data as any)?.session?.state || {}),
              session: {
                actionsRemaining: (data.session?.actions_remaining ?? 10) as number,
              },
              player: toPlayer((data as any)?.session?.state || {}),
            };

            const startRes = await fetch("/api/gm/start", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(gmStartBody),
            });
            const startJson: any = await startRes.json().catch(() => ({}));
            if (startRes.ok && startJson?.narration) {
              setLog((prev) => [...prev, { role: "gm", text: startJson.narration }]);
              setActions(
                typeof startJson.actionsRemaining === "number"
                  ? startJson.actionsRemaining
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
      const res = await fetch("/api/gm/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          worldCapsule: "",
          mission: toGmMission((window as any).__lastSessionState || {}),
          session: { actionsRemaining: actions ?? 10 },
          player: toPlayer((window as any).__lastSessionState || {}),
          last: { actionText: action },
          sessionId, 
        } as GmTurnInput),
      });

      const raw: any = await res.json().catch(() => ({}));
      // Accept either legacy { ok, narrative, engine } or GM { narration, actionsRemaining }
      if (!res.ok && !raw?.narration) {
        const msg = raw?.error || `HTTP ${res.status}`;
        setError(msg);
        setLog((prev) => [...prev, { role: "gm", text: `⛔ ${msg}` }]);
        return;
      }

      if (raw?.narration) {
        const gmOut = raw as GmOutput;
        setActions(gmOut.actionsRemaining);
        setLog((prev) => [
        ...prev,
        { role: "gm", text: gmOut.narration, debug: gmOut.debug }  // 👈 include debug
        ]);
      } else {
        const data = raw as ApiTurnResponse;
        setLog((prev) => [
          ...prev,
          { role: "gm", text: data.narrative ?? "⚠ No narrative returned", debug: data.engine?.debug },
        ]);
        if (typeof data.engine?.actionsRemaining === "number") {
          setActions(data.engine.actionsRemaining);
        }
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
      <div className="mb-2 text-sm opacity-80">
        Actions remaining: {actions ?? "—"}
      </div>

      {error && (
        <div className="mb-3 rounded bg-red-900/30 border border-red-700/50 p-2 text-sm">
          {error}
        </div>
      )}

      <div className="mb-4 space-y-2">
        {log.map((t, i) => (
          <div key={i} className={t.role === "gm" ? "bg-white/5 p-2 rounded" : "text-right"}>
            <div className="text-xs opacity-70 mb-0.5">{t.role === "gm" ? "GM" : "You"}</div>
            <div className="whitespace-pre-wrap leading-relaxed">{t.text}</div>
            {t.debug ? (
              <details className="mt-1 opacity-70 text-xs">
                <summary>Debug</summary>
                <pre className="overflow-auto">{JSON.stringify(t.debug, null, 2)}</pre>
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
