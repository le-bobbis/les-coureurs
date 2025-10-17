// src/app/api/gm/turn/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { WORLD_CAPSULE } from "@/lib/worldCapsule";
import {
  GmTurnInputSchema,
  GmTurnOutputSchema,
  type GmTurnInput,
  type GmTurnOutput,
} from "@/lib/gmSchemas";

const MODEL = "gpt-4o-mini";
const WORD_BUDGET = 150;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function GET() {
  return NextResponse.json({ ok: true, route: "gm/turn", now: new Date().toISOString() });
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }
  try {
    const body = await req.json();
    const parsed = GmTurnInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid GM input", issues: parsed.error.issues }, { status: 400 });
    }
    const input: GmTurnInput = parsed.data;

    // decrement for a taken turn (server-authoritative)
    const displayedActions = Math.max(0, input.session.actionsRemaining - 1);

    const system = `
You are the Game Master for LES COUREURS — a grounded, lethal world.
Honor the World Capsule and the mission seed. Reply in JSON only.
`.trim();

    const rails = `
FORMAT
- Return strictly JSON: { "narration": string, "summary": string[], "actionsRemaining": number }.
- Narration ≤ ${WORD_BUDGET} words, present tense, concrete and restrained.
- Summary: 1–3 bullet strings; each must be a fact explicitly stated in the narration (no new info).
- actionsRemaining: return exactly ${displayedActions}.

AGENCY & CHALLENGE
- Your goal is to challenge the player by introducing obstacles and dilemmas every turn. This is a dangerous world. Every mission courts death.
- Punish mistakes (costs, wounds, delays); reward cleverness and resourcefulness (position, time, openings).
- NEVER take actions or make decisions on behalf of the player. Do not add intent they did not state.
- As turns elapse or the player nears the objective, escalate danger and pressure credibly.

TURN RESOLUTION
- Resolve ONLY the player's stated action. Apply immediate, realistic consequences.
- Use mission.mission_prompt to keep terrain, faction motives, resource pressures, and a complication trigger coherent.
- Advance clocks/pressures when warranted. No suggested options in this response.
`.trim();

    const user = `
WORLD CAPSULE
${(input.worldCapsule || WORLD_CAPSULE).trim()}

MISSION
title: ${input.mission.title}
brief: ${input.mission.brief}
objective: ${input.mission.objective ?? "—"}
opening: ${input.mission.opening ?? "—"}
mission_type: ${input.mission.mission_type}
GM guidance:
${input.mission.mission_prompt ?? "—"}

SESSION
actionsRemaining: ${input.session.actionsRemaining}
pressures: ${(input.session.pressures ?? []).join(", ") || "—"}
flags: ${JSON.stringify(input.session.flags ?? {})}
clocks: ${JSON.stringify(input.session.clocks ?? [])}

PLAYER
name: ${input.player.name}
inventory: ${JSON.stringify(input.player.inventory)}
conditions: ${JSON.stringify(input.player.conditions ?? [])}

PLAYER ACTION
${input.last.actionText ?? "(missing) — if null, treat as no action taken and escalate consequence minimally."}

Return JSON only:
{ "narration": string, "summary": string[], "actionsRemaining": number }
`.trim();

    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "system", content: rails },
        { role: "user", content: user },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let outUnknown: unknown;
    try {
      outUnknown = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "GM returned non-JSON output" }, { status: 502 });
    }

    const safe = GmTurnOutputSchema.safeParse(outUnknown);
    if (!safe.success) {
      return NextResponse.json({ error: "GM output failed schema validation", issues: safe.error.issues }, { status: 422 });
    }

    // fix the count to what we told it to output
    const out: GmTurnOutput = { ...safe.data, actionsRemaining: displayedActions };
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
