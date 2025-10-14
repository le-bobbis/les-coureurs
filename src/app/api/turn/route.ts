import { NextResponse } from "next/server";
import { resolveTurn } from "@/lib/rules";
import { supabaseAdmin } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const { sessionId, playerInput } = (body ?? {}) as { sessionId?: string; playerInput?: string };
  if (!sessionId || !playerInput) {
    return NextResponse.json({ error: "sessionId and playerInput required" }, { status: 400 });
  }

  // 1) Load session
  const { data: session, error: sErr } = await supabaseAdmin
    .from("sessions").select("*").eq("id", sessionId).single();
  if (sErr || !session) {
    return NextResponse.json({ error: sErr?.message || "session not found" }, { status: 404 });
  }

  // 2) Determine next turn index
  const { count: turnCount } = await supabaseAdmin
    .from("turns").select("*", { count: "exact", head: true })
    .eq("session_id", sessionId);
  const turnIndex = turnCount ?? 0;

  // 3) Resolve turn
  const stats = session.stats ?? { STR:5, PER:5, PRC:5, VIT:5, INT:5, CHA:5, MEN:5, RFX:5, LCK:5 };
  const state = session.state ?? {};
  const actionsRemaining = session.actions_remaining ?? 10;

  const actionText = String(playerInput).slice(0, 50);
  const engine = resolveTurn({ sessionId, turnIndex, playerInput: actionText, stats, state, actionsRemaining });

  // 4) Mock narrative (LLM later)
  const narrative =
`You ${actionText}. ${engine.outcomeSummary}
Rain taps the road. The air tastes of iron. You move on.

---
**Summary**
- ${engine.outcomeSummary}
- Action: ${actionText}
- ${engine.worldDelta.injury ? `Injury: ${engine.worldDelta.injury}` : "No injury"}
- **Actions remaining:** ${engine.actionsRemaining}`;

  // 5) Persist turn + decrement actions
  const { error: tErr } = await supabaseAdmin.from("turns").insert([{
    session_id: sessionId,
    idx: turnIndex,
    player_input: actionText,
    narrative,
    summary: JSON.stringify([
      engine.outcomeSummary,
      `Action: ${actionText}`,
      engine.worldDelta.injury ? `Injury: ${engine.worldDelta.injury}` : "No injury"
    ]),
    debug: engine.debug
  }]);
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

  const { error: uErr } = await supabaseAdmin
    .from("sessions")
    .update({ actions_remaining: engine.actionsRemaining })
    .eq("id", sessionId);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  // 6) Return payload
  return NextResponse.json({ ok: true, turnIndex, narrative, engine });
}
