// src/app/api/turn/route.ts
import { NextResponse } from "next/server";
import { resolveTurn } from "@/lib/rules";
import { supabaseAdmin } from "@/lib/db";
import OpenAI from "openai";
import { SYSTEM_GM, buildUserPrompt } from "@/lib/prompts";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getRecentSummaries(sessionId: string, limit = 2): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("turns")
    .select("summary")
    .eq("session_id", sessionId)
    .order("idx", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  const lines: string[] = [];
  for (const row of data) {
    try {
      const arr = Array.isArray(row.summary) ? row.summary : JSON.parse(row.summary ?? "[]");
      for (const s of arr) if (typeof s === "string") lines.push(s);
    } catch {
      // ignore parse issues
    }
  }
  return lines.slice(0, limit);
}

function fallbackNarrative(actionText: string, engine: ReturnType<typeof resolveTurn>) {
  return `You ${actionText}. ${engine.outcomeSummary}
Rain taps the road. The air tastes of iron. You move on.

---
**Summary**
- ${engine.outcomeSummary}
- Action: ${actionText}
- ${engine.worldDelta.injury ? `Injury: ${engine.worldDelta.injury}` : "No injury"}
- **Actions remaining:** ${engine.actionsRemaining}`;
}

// very small validator — keeps you safe if model misbehaves
function parseLLM(output: string, actionsRemaining: number) {
  const idx = output.indexOf("\n---");
  if (idx === -1) throw new Error("No summary delimiter found");
  const narrative = output.slice(0, idx).trim();
  const summary = output.slice(idx).trim();

  if (!summary.includes("**Summary**")) throw new Error("Missing Summary header");
  if (!summary.includes(`**Actions remaining:** ${actionsRemaining}`)) {
    throw new Error("Actions remaining mismatch");
  }
  const wordCount = narrative.split(/\s+/).filter(Boolean).length;
  if (wordCount > 150) throw new Error("Narrative exceeds 150 words");
  return { narrative, summary };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const { sessionId, playerInput } = (body ?? {}) as {
      sessionId?: string;
      playerInput?: string;
    };
    if (!sessionId || !playerInput) {
      return NextResponse.json({ error: "sessionId and playerInput required" }, { status: 400 });
    }

    // 1) Load session row
    const { data: session, error: sErr } = await supabaseAdmin
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .single();
    if (sErr || !session) {
      return NextResponse.json({ error: sErr?.message || "session not found" }, { status: 404 });
    }

    // 2) Compute next turn index
    const { count: turnCount, error: cErr } = await supabaseAdmin
      .from("turns")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
    const turnIndex = turnCount ?? 0;

    // 3) Run deterministic engine (math)
    // (Phase 7 will load actual profile stats)
    const stats = { STR:5, PER:5, PRC:5, VIT:5, INT:5, CHA:5, MEN:5, RFX:5, LCK:5 };
    const state = session.state ?? {};
    const actionsRemaining = session.actions_remaining ?? 10;

    const actionText = String(playerInput).slice(0, 50);
    const engine = resolveTurn({
      sessionId,
      turnIndex,
      playerInput: actionText,
      stats,
      state,
      actionsRemaining,
    });

    // 4) Ask LLM to narrate; strict-parse; fallback on any issue
    let narrative: string;
    try {
      const recentHistory = await getRecentSummaries(sessionId, 2);
      const userPrompt = buildUserPrompt({
        playerInput: actionText,
        outcomeSummary: engine.outcomeSummary,
        actionsRemaining: engine.actionsRemaining,
        recentHistory,
        // loreHints omitted on purpose
      });

      // If OPENAI_API_KEY is missing or request fails → catch/fallback below
      const resp = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_GM },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 450,
      });

      const text = resp.choices?.[0]?.message?.content?.trim() || "";
      const parsed = parseLLM(text, engine.actionsRemaining);
      narrative = `${parsed.narrative}\n\n${parsed.summary}`;
    } catch {
      narrative = fallbackNarrative(actionText, engine);
    }

    // 5) Persist turn + decrement actions
    const { error: tErr } = await supabaseAdmin.from("turns").insert([
      {
        session_id: sessionId,
        idx: turnIndex,
        player_input: actionText,
        narrative,
        summary: JSON.stringify([
          engine.outcomeSummary,
          `Action: ${actionText}`,
          engine.worldDelta.injury ? `Injury: ${engine.worldDelta.injury}` : "No injury",
        ]),
        debug: engine.debug,
      },
    ]);
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    const { error: uErr } = await supabaseAdmin
      .from("sessions")
      .update({ actions_remaining: engine.actionsRemaining })
      .eq("id", sessionId);
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, turnIndex, narrative, engine });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("Unhandled /api/turn error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
