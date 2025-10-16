// src/app/api/turn/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/dbAdmin";
import { resolveTurn } from "@/lib/rules";
import { SYSTEM_GM, buildUserPrompt } from "@/lib/prompts";
import type { EngineOutput, GameState, Stats } from "@/types";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type SafeJsonOk = { ok: true; data: { sessionId?: string; playerInput?: string } };
type SafeJsonErr = { ok: false; error: string };

type SessionRow = {
  id: string;
  state: unknown | null;
  actions_remaining: number | null;
  // optional: stats if you have that column later; fallback used otherwise
  stats?: Stats;
};

type TurnSummaryRow = { summary: unknown };

export async function POST(req: Request) {
  try {
    const body = await safeJson(req);
    if (!body.ok) return jsonError(body.error, 400);
    const { sessionId, playerInput } = body.data;

    if (!sessionId || !playerInput) return jsonError("sessionId and playerInput required", 400);
    if (typeof playerInput !== "string" || playerInput.length > 50) {
      return jsonError("playerInput must be ≤ 50 chars", 400);
    }

    // 1) Load session
    const { data: session, error: sErr } = await supabaseAdmin
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single<SessionRow>();
    if (sErr || !session) return jsonError(sErr?.message || "session not found", 404);

    // 2) Next turn index (count existing)
    const { count, error: cErr } = await supabaseAdmin
      .from("turns")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (cErr) return jsonError(cErr.message);
    const turnIndex = count ?? 0;

    // 3) Gather inputs (typed)
    const stats: Stats =
      session.stats ?? { STR: 5, PER: 5, PRC: 5, VIT: 5, INT: 5, CHA: 5, MEN: 5, RFX: 5, LCK: 5 };

    const state: GameState = toGameState(session.state);
    const missionCtx = {
      title: state?.mission?.title ?? "Unknown",
      objective: state?.mission?.objective ?? "",
      mission_prompt: state?.mission?.mission_prompt ?? "",
    };

    const actionsRemaining = (session.actions_remaining ?? 10) as number;

    // 4) Rules resolve
    const engine: EngineOutput = resolveTurn({
      sessionId,
      turnIndex,
      playerInput,
      stats,
      state,
      actionsRemaining,
    });

    // 5) History summary (last 2)
    const { data: last2, error: hErr } = await supabaseAdmin
      .from("turns")
      .select("summary")
      .eq("session_id", sessionId)
      .order("idx", { ascending: false })
      .limit(2);

    if (hErr) console.error("[turn] history load failed:", hErr);

    const historySummary: string[] = ((last2 ?? []) as TurnSummaryRow[])
      .flatMap((t) => (Array.isArray(t.summary) ? (t.summary as unknown[]) : []))
      .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
      .slice(0, 6);

    // 6) LLM call with robust fallback
    let narrative: string;
    try {
      const userPrompt = buildUserPrompt({
        playerInput,
        engine,
        mission: {
          title: missionCtx.title,
          objective: missionCtx.objective,
          // map DB's mission_prompt to builder's `prompt`
          prompt: missionCtx.mission_prompt,
        },
        historySummary,
      });

      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: SYSTEM_GM },
          { role: "user", content: userPrompt },
        ],
      });

      narrative =
        resp.choices?.[0]?.message?.content?.toString().trim() ||
        fallbackText(playerInput, engine.outcomeSummary, engine.actionsRemaining, engine.worldDelta.injury);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[turn] LLM error:", msg);
      narrative = fallbackText(
        playerInput,
        engine.outcomeSummary,
        engine.actionsRemaining,
        engine.worldDelta.injury
      );
    }

    // 7) Persist turn
    const turnRow = {
      session_id: sessionId,
      idx: turnIndex,
      player_input: playerInput,
      narrative,
      summary: [
        engine.outcomeSummary,
        `Action: ${playerInput}`,
        engine.worldDelta.injury ? `Injury: ${engine.worldDelta.injury}` : "No injury",
      ],
      debug: engine.debug,
    };
    const { error: tErr } = await supabaseAdmin.from("turns").insert([turnRow]);
    if (tErr) {
      console.error("[turn] insert failed:", tErr);
      return jsonError(tErr.message);
    }

    // 8) Update actions
    const { error: uErr } = await supabaseAdmin
      .from("sessions")
      .update({ actions_remaining: engine.actionsRemaining })
      .eq("id", sessionId);
    if (uErr) {
      console.error("[turn] session update failed:", uErr);
      return jsonError(uErr.message);
    }

    return NextResponse.json({ ok: true, turnIndex, narrative, engine });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[turn] unhandled error:", msg);
    return jsonError(msg);
  }
}

async function safeJson(req: Request): Promise<SafeJsonOk | SafeJsonErr> {
  try {
    const data = await req.json();
    if (!data || typeof data !== "object") return { ok: false, error: "Invalid JSON body" };
    return { ok: true, data: data as SafeJsonOk["data"] };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
}

/** Normalize arbitrary DB JSON → GameState (light validation, no throws) */
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
      light: env.light === "dark" || env.light === "dim" || env.light === "normal" ? (env.light as "dark" | "dim" | "normal") : undefined,
      weather: env.weather === "rain" || env.weather === "clear" ? (env.weather as "rain" | "clear") : undefined,
      terrain: env.terrain === "mud" || env.terrain === "rock" || env.terrain === "road" ? (env.terrain as "mud" | "rock" | "road") : undefined,
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

function fallbackText(
  playerInput: string,
  outcomeSummary: string,
  actionsRemaining: number,
  injury: "minor" | "major" | null | undefined
) {
  return `You ${playerInput}. ${outcomeSummary}
Rain taps the road. The air tastes of iron. You move on.

---
**Summary**
- ${outcomeSummary}
- Action: ${playerInput}
- ${injury ? `Injury: ${injury}` : "No injury"}
- **Actions remaining:** ${actionsRemaining}`;
}
