export type InventoryItemInput = {
  profileId: string;
  name: string;      // "Rope"
  emoji: string;     // "🪢"
  descr: string;     // "Coarse hemp rope, 10m"
  itemSlug?: string; // optional, if using catalog
  qty?: number;      // default 1
};

export type Stats = {
  STR:number; PER:number; PRC:number; VIT:number; INT:number; CHA:number; MEN:number; RFX:number; LCK:number;
};

export type CheckResult = {
  name: string;
  dc: number;
  parts: { d20:number; stat:number; item:number; situational:number };
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

export type EngineInput = {
  sessionId: string;
  turnIndex: number;
  playerInput: string;
  stats: Stats;
  state: any;
  actionsRemaining: number;
};

export type EngineOutput = {
  outcomeSummary: string;
  checksBrief: string[];
  worldDelta: {
    injury?: "minor"|"major"|null;
    itemNotes?: string[];
    flags?: string[];
    inventoryChanges?: Array<{id?:string; name:string; delta:number; status?:string}>;
  };
  actionsRemaining: number;
  debug: TurnDebug;
};

