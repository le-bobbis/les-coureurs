export type Stats = {
  STR: number;
  PER: number;
  PRC: number;
  VIT: number;
  INT: number;
  CHA: number;
  MEN: number;
  RFX: number;
  LCK: number;
};

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
  itemsUsed: Array<{
    id?: string;
    name: string;
    effect?: string;
    consumed?: boolean;
    damaged?: boolean;
  }>;
  stateDelta: Record<string, unknown>;
};

export type InventoryEntry = { name: string; emoji?: string };

export type GameState = {
  env?: { light?: string; weather?: string; terrain?: string };
  range?: "close" | "long" | string;
  inventory?: InventoryEntry[];
};

export type EngineInput = {
  sessionId: string;
  turnIndex: number; // 0..9
  playerInput: string; // <= 50 chars
  stats: Stats;
  state: GameState; // no `any`
  actionsRemaining: number;
};

export type EngineOutput = {
  outcomeSummary: string; // short, factual
  checksBrief: string[]; // e.g. ["Climb SUCCESS (d20+STR+rope > DC14)"]
  worldDelta: {
    injury?: "minor" | "major" | null;
    itemNotes?: string[];
    flags?: string[];
    inventoryChanges?: Array<{
      id?: string;
      name: string;
      delta: number;
      status?: string;
    }>;
  };
  actionsRemaining: number;
  debug: TurnDebug;
};
