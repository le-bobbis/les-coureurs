// src/app/api/turn/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";
import { resolveTurn } from "@/lib/rules";
import { SYSTEM_GM, buildUserPrompt } from "@/lib/prompts";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

function jsonError(message: string, status = 500) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

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
      .single();
    if (sErr || !session) return jsonError(sErr?.message || "session not found", 404);

    // 2) Compute next turn index
    const { count, error: cErr } = await supabaseAdmin
      .from("turns")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (cErr) return jsonError(cErr.message);
    const turnIndex = count ?? 0;

    // 3) Gather inputs
    const stats =
      session.stats ??
      { STR: 5, PER: 5, PRC: 5, VIT: 5, INT: 5, CHA: 5, MEN: 5, RFX: 5, LCK: 5 };

    const state = session.state ?? {};
    const missionCtx = state?.mission ?? {
      title: "Unknown",
      objective: "",
      mission_prompt: "",
    };
    const actionsRemaining = session.actions_remaining ?? 10;

    // 4) Rules resolve
    const engine = resolveTurn({
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

    const historySummary: string[] = (last2 ?? [])
      .flatMap((t: any) => (Array.isArray(t.summary) ? t.summary : []))
      .slice(0, 6);

    // 6) LLM call with robust fallback
    let narrative: string;
    try {
      // Map mission.mission_prompt (DB/state) → mission.prompt (prompt builder type)
      const userPrompt = buildUserPrompt({
        playerInput,
        engine,
        mission: {
          title: missionCtx.title ?? "Unknown",
          objective: missionCtx.objective ?? "",
          prompt: missionCtx.mission_prompt ?? "",
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
    } catch (llmErr: any) {
      console.error("[turn] LLM error:", llmErr?.message || llmErr);
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
  } catch (e: any) {
    console.error("[turn] unhandled error:", e?.stack || e?.message || e);
    return jsonError(e?.message || "Internal error");
  }
}

async function safeJson(
  req: Request
): Promise<{ ok: true; data: any } | { ok: false; error: string }> {
  try {
    const data = await req.json();
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }
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
