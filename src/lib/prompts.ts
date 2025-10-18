// src/lib/prompts.ts
import type { EngineOutput } from "@/types";

// --------------------------------------------------
// Constants
// --------------------------------------------------

export const GM_WORD_BUDGET = 150;

export const SYSTEM_GM = `
You are the Game Master for LES COUREURS — alternate 19th-century Europe ravaged by undeath.
Maintain a grounded, lethal tone. Keep prose lean, sensory, and in second-person present tense.
`.trim();

export const START_RAILS = (actionsRemaining: number, wordBudget = GM_WORD_BUDGET) => `
FORMAT
- Return strictly JSON: { "narration": string, "summary": string[], "actionsRemaining": number }.
- Narration ≤ ${wordBudget} words, present tense, concrete and restrained.
- Summary: 1–3 bullet strings; each must be a fact explicitly stated in the narration (no new info).
- actionsRemaining: return exactly ${actionsRemaining}.

OPENING
- Use mission.opening if provided to stage the first scene (tighten/clarify/expand, but do not contradict).
- Integrate mission.mission_prompt for terrain, motive, resource pressure, and a complication trigger.
- Set the stakes and immediate danger. Do NOT present explicit choice menus.
`.trim();

export const TURN_RAILS = (actionsRemaining: number, wordBudget = GM_WORD_BUDGET) => `
FORMAT
- Return strictly JSON: { "narration": string, "summary": string[], "actionsRemaining": number }.
- Narration ≤ ${wordBudget} words, present tense, concrete and restrained.
- Summary: 1–3 bullet strings; each must be a fact explicitly stated in the narration (no new info).
- actionsRemaining: return exactly ${actionsRemaining}.

PRINCIPLES
- Execute only what the player attempted; never decide for them.
- Keep tension high, grounded, and consequence-forward. No choice menus or OOC chatter.
- Reflect the deterministic engine outcome and pressures from the mission state.
`.trim();

// --------------------------------------------------
// Types
// --------------------------------------------------

type BaseMissionArgs = {
  title: string;
  brief?: string | null;
  objective?: string | null;
  prompt?: string | null;
  opening?: string | null;
};

type StartPromptArgs = {
  worldCapsule: string;
  mission: BaseMissionArgs;
  session: {
    actionsRemaining: number;
    pressures?: string[];
    flags?: Record<string, boolean> | undefined;
    clocks?: Array<{ key: string; label: string; ticks: number; max: number }>;
  };
  player: {
    name: string;
    inventory: Array<{ name: string; qty: number }>;
    stats?: Record<string, number>;
    conditions?: string[];
  };
};

type TurnPromptArgs = {
  worldCapsule: string;
  mission: Pick<BaseMissionArgs, "title" | "objective" | "prompt">;
  playerInput: string;
  engine: EngineOutput;
  historySummary: string[];
  preTurnActionsRemaining: number;
  sessionFlags?: string[];
};

// --------------------------------------------------
// Prompt Builders
// --------------------------------------------------

export function buildStartPrompt(args: StartPromptArgs): string {
  const { worldCapsule, mission, session, player } = args;
  const pressuresLine = session.pressures?.length ? session.pressures.join(", ") : "—";
  const flagsLine = session.flags
    ? Object.keys(session.flags)
        .filter((f) => session.flags?.[f])
        .join(", ")
    : "—";
  const clocksBlock = session.clocks?.length
    ? session.clocks.map((c) => `${c.label} (${c.ticks}/${c.max})`).join("\n")
    : "—";
  const inventoryBlock = player.inventory.length
    ? player.inventory.map((i) => `- ${i.name} ×${i.qty}`).join("\n")
    : "- empty";
  const statsBlock = player.stats
    ? Object.entries(player.stats)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "—";
  const conditionsBlock = player.conditions?.length ? player.conditions.join(", ") : "—";

  return [
    "WORLD CAPSULE",
    worldCapsule.trim(),
    "",
    "MISSION",
    `title: ${mission.title}`,
    `brief: ${mission.brief ?? "—"}`,
    `objective: ${mission.objective ?? "—"}`,
    `opening: ${mission.opening ?? "—"}`,
    `mission_prompt: ${mission.prompt ?? "—"}`,
    "",
    "SESSION",
    `actionsRemaining: ${session.actionsRemaining}`,
    `pressures: ${pressuresLine}`,
    `flags: ${flagsLine}`,
    "clocks:",
    clocksBlock,
    "",
    "PLAYER",
    `name: ${player.name}`,
    "inventory:",
    inventoryBlock,
    `conditions: ${conditionsBlock}`,
    `stats: ${statsBlock}`,
    "",
    "TASK",
    "Stage the opening scene honoring mission guidance. No explicit options.",
  ]
    .filter(Boolean)
    .join("\n");
}

// --------------------------------------------------
// Turn Prompt Builder
// --------------------------------------------------

export function buildUserPrompt(args: TurnPromptArgs): string {
  const {
    worldCapsule,
    mission,
    playerInput,
    engine,
    historySummary,
    preTurnActionsRemaining,
    sessionFlags,
  } = args;

  const missionBlock = [
    `Mission: ${mission.title}`,
    mission.objective ? `Objective: ${mission.objective}` : null,
    mission.prompt ? `Mission prompt: ${mission.prompt}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const historyBlock = historySummary?.length
    ? `Recent summary (newest first):\n- ${historySummary.join("\n- ")}`
    : "Recent summary: (none)";

  // safely extract worldDelta fields
  const deltaLines: string[] = [];
  const wd = (engine.worldDelta ?? {}) as EngineOutput["worldDelta"];

  if (wd?.injury) deltaLines.push(`Injury applied: ${wd.injury}`);
  if (Array.isArray(wd?.flags) && wd.flags.length)
    deltaLines.push(`Flags triggered: ${wd.flags.join(", ")}`);
  if (Array.isArray(wd?.itemNotes) && wd.itemNotes.length)
    deltaLines.push(`Item usage: ${wd.itemNotes.join("; ")}`);

  if (Array.isArray(wd?.inventoryChanges) && wd.inventoryChanges.length) {
    const invChanges = wd.inventoryChanges
      .map((change) => {
        const deltaVal = typeof change?.delta === "number" ? change.delta : 0;
        const qty = deltaVal > 0 ? `+${deltaVal}` : `${deltaVal}`;
        const label =
          typeof change.name === "string"
            ? change.name
            : typeof change.id === "string"
            ? change.id
            : "item";
        return `${label} (${qty})`;
      })
      .join(", ");
    deltaLines.push(`Inventory shifts: ${invChanges}`);
  }

  if (sessionFlags?.length) deltaLines.push(`Active flags: ${sessionFlags.join(", ")}`);

  const outcomeLines = [
    `Engine outcome: ${engine.outcomeSummary}`,
    Array.isArray(engine.checksBrief) && engine.checksBrief[0]
      ? `Check: ${engine.checksBrief[0]}`
      : null,
    `Actions remaining before turn: ${preTurnActionsRemaining}`,
    `Actions remaining after turn: ${engine.actionsRemaining}`,
  ]
    .concat(deltaLines)
    .filter(Boolean)
    .join("\n");

  return [
    "WORLD CAPSULE",
    worldCapsule.trim(),
    "",
    missionBlock,
    "",
    historyBlock,
    "",
    `Player action (authoritative): "${playerInput}"`,
    "",
    outcomeLines,
    "",
    "Write a single beat of narrative honoring the engine outcome. Then supply summary bullets that restate facts only.",
  ]
    .filter(Boolean)
    .join("\n");
}
