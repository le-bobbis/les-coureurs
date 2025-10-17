// src/lib/gmClient.ts
import type { TurnDebug } from "@/types";

type MissionType = "Deliver" | "Rescue" | "Recover" | "Hunt" | "Escort" | "Unknown";

export type GmMission = {
  title: string;
  brief: string;
  objective?: string | null;
  opening?: string | null;
  mission_prompt?: string | null;
  mission_type: MissionType;
};

export type GmStartInput = {
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

export type GmTurnInput = GmStartInput & {
  last: { actionText: string | null };
  sessionId: string;
};

export type GmOutput = {
  narration: string;
  summary: string[];
  actionsRemaining: number;
  debug?: TurnDebug;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

export async function callGmStart(body: GmStartInput): Promise<GmOutput> {
  const res = await fetch("/api/gm/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw: unknown = await res.json().catch(() => ({}));
  if (!isObject(raw) || typeof raw.narration !== "string" || typeof raw.actionsRemaining !== "number" || !Array.isArray(raw.summary)) {
    throw new Error("Invalid GM start response");
  }
  return raw as GmOutput;
}

export async function callGmTurn(body: GmTurnInput): Promise<GmOutput> {
  const res = await fetch("/api/gm/turn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw: unknown = await res.json().catch(() => ({}));
  if (!isObject(raw) || typeof raw.narration !== "string" || typeof raw.actionsRemaining !== "number" || !Array.isArray(raw.summary)) {
    // Pass through server error if present
    const msg = isObject(raw) && typeof raw.error === "string" ? raw.error : `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return raw as GmOutput;
}
