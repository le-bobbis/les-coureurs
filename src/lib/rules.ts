import type {
  EngineInput,
  EngineOutput,
  CheckResult,
  Stats,
  GameState,
} from "@/types";

/** FNV-1a hash to int32 */
function hashToInt(s: string) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Seeded PRNG (LCG) */
function prng(seed: number) {
  let x = seed >>> 0;
  return () => ((x = (1664525 * x + 1013904223) >>> 0), x / 2 ** 32);
}

function d20(rand: () => number) {
  return Math.floor(rand() * 20) + 1;
}

/** Simple intent classifier (literal, minimal) */
export function classify(
  input: string
): "climb" | "sneak" | "shoot" | "melee" | "search" | "talk" | "intimidate" | "run" | "use" | "other" {
  const s = input.toLowerCase();
  if (/\bclimb|scale|ascend\b/.test(s)) return "climb";
  if (/\bsneak|creep|quiet\b/.test(s)) return "sneak";
  if (/\bshoot|aim|fire\b/.test(s)) return "shoot";
  if (/\bstab|slash|strike|swing|melee\b/.test(s)) return "melee";
  if (/\bsearch|look|scan|inspect|track\b/.test(s)) return "search";
  if (/\btalk|persuade|ask|plead\b/.test(s)) return "talk";
  if (/\bthreat|intimidate|menace\b/.test(s)) return "intimidate";
  if (/\brun|dash|dodge|roll\b/.test(s)) return "run";
  if (/\buse\b/.test(s)) return "use";
  return "other";
}

function statFor(intent: ReturnType<typeof classify>): keyof Stats {
  switch (intent) {
    case "climb": return "STR";
    case "sneak": return "PER";
    case "shoot": return "PRC";
    case "melee": return "STR";
    case "search": return "PER";
    case "talk": return "CHA";
    case "intimidate": return "MEN";
    case "run": return "RFX";
    default: return "PER";
  }
}

/** Situational modifier from crude flags; keep small and predictable */
function situationalMod(state: GameState, intent: string): number {
  let mod = 0;
  if (state?.env?.light === "dark") mod -= 2;
  if (state?.env?.light === "dim") mod -= 1;
  if (state?.env?.weather === "rain") mod -= 1;
  if (state?.env?.terrain === "mud") mod -= 1;
  if (intent === "shoot" && state?.range === "long") mod -= 2;
  if (intent === "shoot" && state?.range === "close") mod += 1;
  return mod;
}

/** DC table by intent; tweak as you balance */
function baseDC(intent: string): number {
  switch (intent) {
    case "climb": return 12;
    case "sneak": return 12;
    case "shoot": return 12;
    case "melee": return 12;
    case "search": return 10;
    case "talk": return 12;
    case "intimidate": return 12;
    case "run": return 10;
    default: return 12;
  }
}

/** Apply category; Luck gives a tie edge */
function categorize(total: number, dc: number, nat: number, LCK: number): CheckResult["result"] {
  const t = total === dc && LCK >= 6 ? total + 1 : total;
  if (nat === 20 || t >= dc + 5) return "critical";
  if (t >= dc) return "success";
  if (t >= dc - 2) return "mixed";
  return "fail";
}

/** Very simple item bonus inference (expand later) */
function inferItemBonus(
  state: GameState,
  input: string,
  intent: string
): { bonus: number; notes: string[] } {
  const s = input.toLowerCase();
  const inv = state?.inventory ?? [];
  let bonus = 0;
  const notes: string[] = [];

  const has = (n: string) => inv.some(it => it.name?.toLowerCase() === n || it.emoji === n);
  if (intent === "climb" && (has("rope") || s.includes("rope"))) { bonus += 2; notes.push("Rope used; +2"); }
  if (intent === "sneak" && (has("cloak") || s.includes("cloak"))) { bonus += 1; notes.push("Cloak muffles sound; +1"); }
  if (intent === "shoot" && (has("pistol") || s.includes("pistol"))) { bonus += 1; notes.push("Familiar pistol; +1"); }

  return { bonus, notes };
}

/** Main resolver: pure logic, deterministic per (sessionId, turnIndex) */
export function resolveTurn(input: EngineInput): EngineOutput {
  const seed = hashToInt(`${input.sessionId}:${input.turnIndex}`);
  const rand = prng(seed);

  const intent = classify(input.playerInput);
  const primary = statFor(intent);
  const situ = situationalMod(input.state, intent);
  const dc = baseDC(intent) + Math.max(0, -situ);  // slightly harder in bad conditions

  const { bonus: itemBonus, notes: itemNotes } = inferItemBonus(input.state, input.playerInput, intent);

  const nat = d20(rand);
  const statVal = input.stats[primary] ?? 5;
  const total = nat + statVal + itemBonus + situ;

  const result = categorize(total, dc, nat, input.stats.LCK ?? 5);

  const worldDelta: EngineOutput["worldDelta"] = { injury: null, itemNotes, flags: [], inventoryChanges: [] };
  if (result === "mixed") worldDelta.injury = "minor";
  if (result === "fail" && (intent === "melee" || intent === "climb")) worldDelta.flags!.push("death_gate_candidate");

  const check: CheckResult = {
    name: intent[0].toUpperCase() + intent.slice(1),
    dc,
    parts: { d20: nat, stat: statVal, item: itemBonus, situational: situ },
    total,
    result,
  };

  const outcomeSummary =
    result === "critical" ? `You ${intent}; it exceeds expectation.` :
    result === "success"  ? `You ${intent} and achieve your goal.` :
    result === "mixed"    ? `You ${intent}; progress with a cost.` :
                            `You ${intent} and fail; danger rises.`;

  return {
    outcomeSummary,
    checksBrief: [
      `${check.name} ${result.toUpperCase()} (d20+${primary}${itemBonus ? "+item" : ""}${situ ? "+situ" : ""} vs DC${dc})`,
    ],
    worldDelta,
    actionsRemaining: Math.max(0, input.actionsRemaining - 1),
    debug: {
      seed: `${input.sessionId}:${input.turnIndex}`,
      rolls: [nat],
      checks: [check],
      itemsUsed: itemNotes.map(n => ({ name: n })),
      stateDelta: worldDelta,
    },
  };
}
