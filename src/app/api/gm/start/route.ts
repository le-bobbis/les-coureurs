// src/app/api/gm/start/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { WORLD_CAPSULE } from "@/lib/worldCapsule";
import {
  GmStartInputSchema,
  GmTurnOutputSchema,
  type GmStartInput,
  type GmTurnOutput,
} from "@/lib/gmSchemas";

const MODEL = "gpt-4o-mini";
const WORD_BUDGET = 150;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function GET() {
  return NextResponse.json({ ok: true, route: "gm/start", now: new Date().toISOString() });
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }
  try {
    const body = await req.json();
    const parsed = GmStartInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid GM input", issues: parsed.error.issues }, { status: 400 });
    }
    const input: GmStartInput = parsed.data;

    const system = `
You are the Game Master for LES COUREURS — a grounded, lethal world.
Honor the World Capsule and the mission seed. Reply in JSON only.
`.trim();

    const rails = `
FORMAT
- Return strictly JSON: { "narration": string, "summary": string[], "actionsRemaining": number }.
- Narration ≤ ${WORD_BUDGET} words, present tense, concrete and restrained.
- Summary: 1–3 bullet strings; each must be a fact explicitly stated in the narration (no new info).
- actionsRemaining: return exactly ${input.session.actionsRemaining}.

OPENING
- Use mission.opening if provided to stage the first scene (tighten/clarify but do not contradict).
- Integrate mission.mission_prompt for terrain, motive, resource pressure, and a complication trigger.
- Your goal is to set the scene, establish the danger/stakes, and create excitement for the adventure ahead.
- Do NOT present choices in this response.
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

TASK
Start the scene. Establish objective, danger, and a sense of adventure. Do not suggest options.
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

    // belt & suspenders: fix the count to what we told it
    const out: GmTurnOutput = { ...safe.data, actionsRemaining: input.session.actionsRemaining };
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
