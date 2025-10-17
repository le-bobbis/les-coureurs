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

import { supabaseAdmin } from "@/lib/dbAdmin";
import { resolveTurn } from "@/lib/rules";
import type { GameState, Stats, EngineOutput } from "@/types";

const MODEL = "gpt-4o-mini";
const WORD_BUDGET = 150;

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

// Narrow unknown JSON to your GameState shape (matches your /api/turn helper)
function toGameState(val: unknown): GameState {
  const raw = (val && typeof val === "object" ? (val as Record<string, unknown>) : {}) || {};
  const env = (raw.env && typeof raw.env === "object" ? (raw.env as Record<string, unknown>) : {}) || {};
  const mission = (raw.mission && typeof raw.mission === "object" ? (raw.mission as Record<string, unknown>) : {}) || {};

  const invRaw = Array.isArray(raw.inventory) ? raw.inventory : [];
  const inventory = invRaw.map((it) => {
    const o = (it && typeof it === "object" ? (it as Record<string, unknown>) : {}) || {};
    return {
      id: typeof o.id === "string" ? o.id : undefined,
      name: typeof o.name === "string" ? o.name : "",
      emoji: typeof o.emoji === "string" ? o.emoji : undefined,
      status: typeof o.status === "string" ? o.status : undefined,
      qty: typeof o.qty === "number" ? o.qty : undefined,
    };
  });

  return {
    env: {
      light:
        env.light === "dark" || env.light === "dim" || env.light === "normal"
          ? (env.light as "dark" | "dim" | "normal")
          : undefined,
      weather:
        env.weather === "rain" || env.weather === "clear"
          ? (env.weather as "rain" | "clear")
          : undefined,
      terrain:
        env.terrain === "mud" || env.terrain === "rock" || env.terrain === "road"
          ? (env.terrain as "mud" | "rock" | "road")
          : undefined,
    },
    range: raw.range === "long" || raw.range === "close" ? (raw.range as "long" | "close") : undefined,
    inventory,
    mission: {
      title: typeof mission.title === "string" ? mission.title : "Unknown",
      objective: typeof mission.objective === "string" ? mission.objective : "",
      mission_prompt: typeof mission.mission_prompt === "string" ? mission.mission_prompt : "",
    },
    flags: Array.isArray(raw.flags) ? raw.flags.filter((f): f is string => typeof f === "string") : [],
  };
}

export async function POST(req: Request) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // Validate GM input (worldCapsule/mission/session/player/last)
    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = GmTurnInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }
    const input = parsed.data as GmTurnInput;

    // We also require a sessionId (sent by the client page)
    const sessionId =
      typeof (body as Record<string, unknown>)?.["sessionId"] === "string"
        ? ((body as Record<string, unknown>)["sessionId"] as string)
        : undefined;
    if (!sessionId) return jsonError("Missing sessionId in body", 400);
    if (!input.last?.actionText) return jsonError("Missing last.actionText (player action)", 400);

    // --- Load session (need user_id to pull profile stats) ---
    const { data: session, error: sErr } = await supabaseAdmin
      .from("sessions")
      .select("id, user_id, actions_remaining, state, created_at")
      .eq("id", sessionId)
      .single();

    if (sErr || !session) {
      return jsonError(sErr?.message || "Session not found", 404);
    }

    // --- Determine next turn index (opening may or may not exist yet) ---
    const { data: prevTurns, error: tErr } = await supabaseAdmin
      .from("turns")
      .select("idx, summary")
      .eq("session_id", sessionId)
      .order("idx", { ascending: true });

    if (tErr) return jsonError(tErr.message, 500);
    const maxIdx = (prevTurns ?? []).reduce((m, t) => (t.idx > m ? t.idx : m), -1);
    const turnIndex = maxIdx + 1;

    // --- Prepare GameState and actionsRemaining baseline ---
    const state = toGameState(session.state);
    const actionsRemainingBefore = (session.actions_remaining ?? input.session.actionsRemaining ?? 10) as number;

    // --- Load Stats from profiles.stats (JSONB), merge onto defaults ---
    const BASE_STATS: Stats = { STR: 5, PER: 5, PRC: 5, VIT: 5, INT: 5, CHA: 5, MEN: 5, RFX: 5, LCK: 5 };
    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("stats")
      .eq("id", session.user_id) // profiles.id is PK per your schema
      .single();

    if (pErr) {
      // Proceed with defaults; log for observability
      console.warn("[gm/turn] profile stats load error:", pErr);
    }

    const rawStats = (profile?.stats ?? {}) as Partial<Record<keyof Stats, unknown>>;
    const stats: Stats = {
      STR: Number(rawStats.STR ?? BASE_STATS.STR),
      PER: Number(rawStats.PER ?? BASE_STATS.PER),
      PRC: Number(rawStats.PRC ?? BASE_STATS.PRC),
      VIT: Number(rawStats.VIT ?? BASE_STATS.VIT),
      INT: Number(rawStats.INT ?? BASE_STATS.INT),
      CHA: Number(rawStats.CHA ?? BASE_STATS.CHA),
      MEN: Number(rawStats.MEN ?? BASE_STATS.MEN),
      RFX: Number(rawStats.RFX ?? BASE_STATS.RFX),
      LCK: Number(rawStats.LCK ?? BASE_STATS.LCK),
    };

    // --- Run deterministic rules engine ---
    const engine: EngineOutput = resolveTurn({
      sessionId,
      turnIndex,
      playerInput: input.last.actionText,
      stats,
      state,
      actionsRemaining: actionsRemainingBefore,
    });

    // Prepare short history summary for the GM (last 2 summaries)
    const last2Summaries = (prevTurns ?? [])
      .slice(-2)
      .flatMap((t) => (Array.isArray(t.summary) ? t.summary : []));
    const historySummary = last2Summaries.slice(-3).join(" • ");

    // --- Build the GM prompt using engine outcome ---
    const system = `
You are the Game Master for "Les Coureurs", a survival-horror RPG in an alternate early-19th-century Europe.

FORMAT
- Return strictly JSON: { "narration": string, "summary": string[], "actionsRemaining": number }.
- Narration ≤ ${WORD_BUDGET} words, present tense, concrete and restrained.
- Speak in brief non-player dialogue when appropriate
- Summary: 1–3 bullet strings at the end of EVERY reply; each must be the most salient facts explicitly stated in the narration (no new info).
- actionsRemaining: return exactly ${input.session.actionsRemaining}.

GOALS
- Create relentless danger, present dilemmas, punish mistakes, and reward success & ingenuity (all within the grounded realism of the game world)
- Clearly communicate player's progress toward the concrete mission goal; as the player nears their goal, raise the stakes and danger
- Allow the player to succeed if they have earned victory; kill the player character if they should die.

Follow these rules:
- Do not decide for the player; never write their actions.
- Keep it tense and grounded; consequence-forward.
- Avoid more than 2-3 sensory details per reply.
- 2nd person present-tense; ≤ ${WORD_BUDGET} words.
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
actionsRemaining (before): ${actionsRemainingBefore}

PLAYER ACTION
"${input.last.actionText}"

ENGINE OUTCOME (deterministic rules)
- outcomeSummary: ${engine.outcomeSummary}
- injury: ${engine.worldDelta.injury ?? "none"}
- itemsUsed: ${((engine.debug.itemsUsed ?? []).map((i) => i.name).join(", ")) || "—"}
- flags: ${(engine.worldDelta.flags ?? []).join(", ") || "—"}
- inventoryChanges: ${JSON.stringify(engine.worldDelta.inventoryChanges ?? [])}
- actionsRemaining (after): ${engine.actionsRemaining}

HISTORY (last)
${historySummary || "—"}

OUTPUT JSON SHAPE
{ "narration": string (<= ${WORD_BUDGET} words), "summary": string[1..3], "actionsRemaining": number }
`.trim();

    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.6,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    const rawOut = completion.choices[0]?.message?.content ?? "{}";
    let outUnknown: unknown;
    try {
      outUnknown = JSON.parse(rawOut);
    } catch {
      outUnknown = {};
    }

    const checked = GmTurnOutputSchema.safeParse(outUnknown);
    if (!checked.success) {
      return NextResponse.json(
        { error: "GM output failed schema validation", issues: checked.error.issues },
        { status: 422 }
      );
    }

    // --- Persist the turn ---
    const narration = checked.data.narration;
    const summary = [
      engine.outcomeSummary,
      `Action: ${input.last.actionText}`,
      engine.worldDelta.injury ? `Injury: ${engine.worldDelta.injury}` : "No injury",
    ];

    const insertRow = {
      session_id: sessionId,
      idx: turnIndex,
      player_input: input.last.actionText,
      narrative: narration,
      summary,
      debug: engine.debug, // keep dev panel data
    };
    const { error: insErr } = await supabaseAdmin.from("turns").insert([insertRow]);
    if (insErr) {
      console.error("[gm/turn] insert failed:", insErr);
      return jsonError(insErr.message, 500);
    }

    // --- Update actions remaining on the session ---
    const { error: updErr } = await supabaseAdmin
      .from("sessions")
      .update({ actions_remaining: engine.actionsRemaining })
      .eq("id", sessionId);
    if (updErr) {
      console.error("[gm/turn] session update failed:", updErr);
      return jsonError(updErr.message, 500);
    }

    // --- Return GM output + debug to the client ---
    const out: GmTurnOutput & { debug: EngineOutput["debug"] } = {
      ...checked.data,
      actionsRemaining: engine.actionsRemaining, // ensure consistency with engine
      debug: engine.debug,
    };

    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
