// src/types/index.ts

// ===== Core stats =====
export type Stats = {
  STR: number; PER: number; PRC: number; VIT: number; INT: number; CHA: number; MEN: number; RFX: number; LCK: number;
};

// ===== Deterministic engine outputs =====
export type CheckResult = {
  name: string;
  dc: number;
  parts: { d20: number; stat: number; item: number; situational: number };
  total: number;
  result: "critical" | "success" | "mixed" | "fail";
};

export type TurnDebug = {
  seed: string;
  rolls: number[];
  checks: CheckResult[];
  itemsUsed: Array<{ id?: string; name: string; effect?: string; consumed?: boolean; damaged?: boolean }>;
  stateDelta: Record<string, unknown>;
};

// ===== Persistent game state kept in sessions.state =====
export type GameState = {
  env?: {
    light?: "dark" | "dim" | "normal";
    weather?: "rain" | "clear";
    terrain?: "mud" | "rock" | "road";
  };
  range?: "long" | "close";
  inventory?: Array<{ id?: string; name: string; emoji?: string; status?: string; qty?: number }>;
  mission?: { title: string; objective?: string | null; mission_prompt?: string | null };
  flags?: string[];
};

// ===== Engine I/O =====
export type EngineInput = {
  sessionId: string;
  turnIndex: number;       // 0..9
  playerInput: string;     // <= 50 chars
  stats: Stats;
  state: GameState;        // <-- strongly typed now
  actionsRemaining: number;
};

export type EngineOutput = {
  outcomeSummary: string;  // short, factual
  checksBrief: string[];   // e.g. ["Climb success (d20+STR+rope > DC14)"]
  worldDelta: {
    injury?: "minor" | "major" | null;
    itemNotes?: string[];
    flags?: string[];
    inventoryChanges?: Array<{ id?: string; name: string; delta: number; status?: string }>;
  };
  actionsRemaining: number;
  debug: TurnDebug;
};
