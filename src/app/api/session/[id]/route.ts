// src/app/api/session/[id]/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
+ import { supabaseAdmin } from "@/lib/dbAdmin";

type Params = { id: string };

export async function GET(
  _req: Request,
  ctx: { params: Promise<Params> } // <-- params is async in Next.js 15
) {
  try {
    const { id: sessionId } = await ctx.params; // <-- await it

    if (!sessionId) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const { data: session, error: sErr } = await supabaseAdmin
      .from("sessions")
      .select("id, mission_id, actions_remaining, state, created_at")
      .eq("id", sessionId)
      .single();

    if (sErr || !session) {
      return NextResponse.json(
        { error: sErr?.message || "not found" },
        { status: 404 }
      );
    }

    const { data: turns, error: tErr } = await supabaseAdmin
      .from("turns")
      .select("idx, player_input, narrative, summary, debug, created_at")
      .eq("session_id", sessionId)
      .order("idx", { ascending: true })
      .limit(50);

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session, turns: turns ?? [] });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
