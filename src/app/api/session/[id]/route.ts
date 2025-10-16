import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;

    const { data: session, error: sErr } = await supabaseAdmin
      .from("sessions")
      .select("id, mission_id, actions_remaining, state, created_at")
      .eq("id", id)
      .single();

    if (sErr || !session) {
      return NextResponse.json({ ok: false, error: sErr?.message || "Session not found" }, { status: 404 });
    }

    const { data: turns, error: tErr } = await supabaseAdmin
      .from("turns")
      .select("id, idx, player_input, narrative, summary, debug, created_at")
      .eq("session_id", id)
      .order("idx", { ascending: true });

    if (tErr) {
      return NextResponse.json({ ok: false, error: tErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, session, turns: turns ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
