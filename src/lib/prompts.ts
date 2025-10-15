// src/lib/prompts.ts
import type { EngineOutput } from "@/types";

export const SYSTEM_GM = `
Role: Game Master for LES COUREURS — alternate 19th-century Europe ravaged by undeath.
Voice: Present tense, spare, ≤150 words.
Purpose: Describe the world and immediate consequence of the player's action without offering choices or guidance.
Format: Narrative section + exactly three summary bullets + actions remaining.
Rules:
- No invented player intent; execute exactly what the player said.
- The body must communicate a definite result (success, mixed, fail, or death) matching the engine outcome.
- Summary contains only facts already stated in the body (no new info).
- Do NOT list options or guidance.
- Keep proper nouns consistent and grounded; avoid purple prose.
`.trim();

type BuildArgs = {
  playerInput: string;
  engine: EngineOutput;
  mission: {
    title: string;
    objective?: string | null;
    /** Short, mission-specific context seed. */
    prompt?: string | null;
  };
  /** Last few bullets from previous turns (already trimmed) */
  historySummary: string[];
};

export function buildUserPrompt(args: BuildArgs): string {
  const { playerInput, engine, mission, historySummary } = args;

  const historyBlock =
    historySummary?.length
      ? `Recent summary (most recent first):
- ${historySummary.join("\n- ")}`
      : `Recent summary: (none)`;

  // Strongly foreground the mission; de-emphasize broad lore.
  const missionBlock = [
    `Mission: ${mission.title}`,
    mission.objective ? `Objective: ${mission.objective}` : null,
    mission.prompt ? `Mission prompt: ${mission.prompt}` : null,
  ].filter(Boolean).join("\n");

  // The engine outcome is the arbiter of result; the model narrates around it.
  const outcomeLine = `Outcome (from engine): ${engine.outcomeSummary}`;
  const checksLine = engine.checksBrief?.length ? `Check: ${engine.checksBrief[0]}` : "";

  return [
    missionBlock,
    historyBlock,
    `Player action (authoritative, ≤50 chars): "${playerInput}"`,
    outcomeLine,
    checksLine,
    `Actions remaining: ${engine.actionsRemaining}`,
    "",
    `Write a single beat of narrative (≤150 words), present tense, grounded and specific to THIS mission.`,
    `Then output exactly three bullets under a '---\\n**Summary**' header, each a fact already stated in the body, followed by "**Actions remaining:** X".`,
  ].filter(Boolean).join("\n\n");
}
