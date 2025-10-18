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
import { GM_WORD_BUDGET, START_RAILS, SYSTEM_GM, buildStartPrompt } from "@/lib/prompts";

const MODEL = "gpt-4o-mini";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "gm/start",
    now: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const parsed = GmStartInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid GM input", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const input: GmStartInput = parsed.data;

    // Prompts (moved to shared helpers)
    const system = SYSTEM_GM;
    const rails = START_RAILS(input.session.actionsRemaining, GM_WORD_BUDGET);
    const user = buildStartPrompt({
      worldCapsule:
        input.worldCapsule && input.worldCapsule.trim().length
          ? input.worldCapsule
          : WORLD_CAPSULE,
      mission: {
        title: input.mission.title,
        brief: input.mission.brief,
        objective: input.mission.objective,
        prompt: input.mission.mission_prompt,
        opening: input.mission.opening,
      },
      session: input.session,
      player: input.player,
    });

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
      return NextResponse.json(
        { error: "GM returned non-JSON output" },
        { status: 502 }
      );
    }

    const safe = GmTurnOutputSchema.safeParse(outUnknown);
    if (!safe.success) {
      return NextResponse.json(
        { error: "GM output failed schema validation", issues: safe.error.issues },
        { status: 422 }
      );
    }

    const out: GmTurnOutput = safe.data;
    return NextResponse.json(out);
  } catch (err) {
    console.error("[gm/start] Error:", err);
    return NextResponse.json(
      { error: "Unhandled server error", detail: String(err) },
      { status: 500 }
    );
  }
}
