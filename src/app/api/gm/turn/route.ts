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
import type { Stats, EngineOutput } from "@/types";
import { applyWorldDelta, normalizeGameState } from "@/lib/gameState";
import { GM_WORD_BUDGET, SYSTEM_GM, TURN_RAILS, buildUserPrompt } from "@/lib/prompts";

const MODEL = "gpt-4o-mini";

function jsonError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
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
    const state = normalizeGameState(session.state);
    const actionsRemainingBefore =
      typeof session.actions_remaining === "number"
        ? session.actions_remaining
        : input.session.actionsRemaining ?? 10;

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

    const nextState = applyWorldDelta(state, engine.worldDelta);

    // Prepare short history summary for the GM (last 2 summaries)
    const last2Summaries = (prevTurns ?? [])
      .slice(-2)
      .flatMap((t) => (Array.isArray(t.summary) ? t.summary : []));
    const historySummary = last2Summaries
      .slice(-3)
      .filter((line): line is string => typeof line === "string");

    // --- Build the GM prompt using engine outcome ---
    const system = SYSTEM_GM;
    const rails = TURN_RAILS(engine.actionsRemaining, GM_WORD_BUDGET);
    const user = buildUserPrompt({
      worldCapsule: input.worldCapsule?.trim().length ? input.worldCapsule : WORLD_CAPSULE,
      mission: {
        title: input.mission.title,
        objective: input.mission.objective,
        prompt: input.mission.mission_prompt,
      },
      playerInput: input.last.actionText,
      engine,
      historySummary,
      preTurnActionsRemaining: actionsRemainingBefore,
      sessionFlags: nextState.flags,
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
    const summary = checked.data.summary;

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

    // --- Update actions remaining and state on the session ---
    const { error: updErr } = await supabaseAdmin
      .from("sessions")
      .update({ actions_remaining: engine.actionsRemaining, state: nextState })
      .eq("id", sessionId);
    if (updErr) {
      console.error("[gm/turn] session update failed:", updErr);
      return jsonError(updErr.message, 500);
    }

    // --- Return GM output + debug + normalized state to the client ---
    const out: GmTurnOutput & { debug: EngineOutput["debug"]; state: typeof nextState } = {
      ...checked.data,
      actionsRemaining: engine.actionsRemaining, // ensure consistency with engine
      debug: engine.debug,
      state: nextState,
    };

    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
